import type { Database } from "@prayerteam/db";
import type { MeResponse } from "@prayerteam/domain";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ProblemError } from "../problems.ts";
import { type Auth, type AuthConfig, createAuth, normaliseEmail } from "./auth.ts";

// The Accounts module: the only thing outside src/auth that knows Better
// Auth exists (ADR 0003). Its instance, internal adapter, header and cookie
// translation and email normalisation all stay behind this interface, so a
// Better Auth upgrade is re-checked here and in test/auth.test.ts and
// test/sessions.test.ts, nowhere else.
export { type AuthConfig, appOrigin, offlineAuthConfig } from "./auth.ts";

// An Account as our code and API shapes see it (GLOSSARY.md): what
// GET /api/me returns. Better Auth calls it a user, and its `name` is our
// display name.
export type Account = MeResponse;

declare module "fastify" {
  interface FastifyContextConfig {
    // Opts a route out of authentication. Every other /api route needs a
    // valid session (#32).
    public?: boolean;
  }
  interface FastifyRequest {
    // The signed-in Account, on every non-public route. The viewer (Member,
    // Church, Teams) is added on top of it by a later spec (ADR 0004).
    account: Account;
  }
}

export class AccountEmailTakenError extends Error {
  override name = "AccountEmailTakenError";

  constructor() {
    super("An Account already exists with that email");
  }
}

class InvalidPasswordLengthError extends Error {
  override name = "InvalidPasswordLengthError";

  constructor(min: number, max: number) {
    super(`Passwords need ${min} to ${max} characters`);
  }
}

export interface Accounts {
  // Create Account (#32): the only way an Account comes into existence,
  // since open sign-up is off. The joining flows (Invite Link, Email Invite)
  // and the seed call it. The email is normalised; a taken one (whatever
  // its case) throws AccountEmailTakenError, even when two creates race.
  create(input: { email: string; password: string; displayName: string }): Promise<Account>;
  // Revoke all sessions for an Account (#32): every device is signed out,
  // and the very next request from any of them gets 401. Member removal and
  // Account deletion call it (#23); password reset and change revoke
  // sessions inside Better Auth (ADR 0003).
  revokeAllSessions(accountId: string): Promise<void>;
  // Adds, on `api` (the /api scope), Better Auth's endpoints under
  // /api/auth/* and the onRequest hook that authenticates every non-public
  // route and sets request.account. Hooks run in the order they are added,
  // so add the app version check first.
  mount(api: FastifyInstance): void;
}

export function createAccounts(db: Database, config: AuthConfig): Accounts {
  const auth = createAuth(db, config);
  return {
    create: (input) => createAccount(auth, input),
    async revokeAllSessions(accountId) {
      const context = await auth.$context;
      await context.internalAdapter.deleteUserSessions(accountId);
    },
    mount(api) {
      api.addHook("onRequest", requireSession(auth));
      mountAuthEndpoints(api, auth, config.baseUrl);
    },
  };
}

function toAccount(user: { id: string; email: string; name: string }): Account {
  return { id: user.id, email: user.email, displayName: user.name };
}

const uniqueViolation = "23505";

// #32 says to call Better Auth's server API, but its sign-up endpoint
// refuses while disableSignUp is on, so this makes the same two records
// through Better Auth's own context and password hasher: the Account, then
// its password credential. Re-check it against Better Auth's sign-up when
// upgrading.
async function createAccount(
  auth: Auth,
  input: { email: string; password: string; displayName: string },
): Promise<Account> {
  const context = await auth.$context;
  const { minPasswordLength, maxPasswordLength } = context.password.config;
  if (input.password.length < minPasswordLength || input.password.length > maxPasswordLength) {
    throw new InvalidPasswordLengthError(minPasswordLength, maxPasswordLength);
  }
  // The internal adapter skips the hook that normalises emails on Better
  // Auth's endpoints (auth.ts), so normalise here too.
  const email = normaliseEmail(input.email);
  if (await context.internalAdapter.findUserByEmail(email)) throw new AccountEmailTakenError();

  let user;
  try {
    user = await context.internalAdapter.createUser(
      { email, name: input.displayName, emailVerified: false },
      { method: "email-password" },
    );
  } catch (error) {
    // Another create for the same email won the race.
    if (hasCode(error, uniqueViolation)) throw new AccountEmailTakenError();
    throw error;
  }
  try {
    await context.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await context.password.hash(input.password),
    });
  } catch (error) {
    // No Account without a way to sign in; a retry can then succeed.
    await context.internalAdapter.deleteUser(user.id);
    throw error;
  }
  return toAccount(user);
}

function hasCode(error: unknown, code: string): boolean {
  for (let e: unknown = error; e; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === code) return true;
  }
  return false;
}

function headersOf(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

// Every Set-Cookie Better Auth answered with, as separate headers.
function forwardCookies(reply: FastifyReply, headers: Headers): void {
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) reply.header("set-cookie", cookies);
}

// Better Auth's own endpoints under /api/auth/*, inside the Fastify app so
// the app-version check and logging apply to them. They are Better Auth's
// shapes, not ours, so they stay out of openapi.json (ADR 0003).
function mountAuthEndpoints(api: FastifyInstance, auth: Auth, baseUrl: string): void {
  api.route({
    method: ["GET", "POST"],
    url: "/auth/*",
    config: { public: true },
    schema: { hide: true },
    async handler(request, reply) {
      const response = await auth.handler(
        new Request(new URL(request.url, baseUrl), {
          method: request.method,
          headers: headersOf(request),
          body: request.body === undefined ? undefined : JSON.stringify(request.body),
        }),
      );
      reply.status(response.status);
      response.headers.forEach((value, name) => {
        if (name !== "set-cookie") reply.header(name, value);
      });
      forwardCookies(reply, response.headers);
      return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
    },
  });
}

// Authenticates every non-public route, and only authenticates (ADR 0004):
// no valid session is 401 unauthenticated. It runs on onRequest, before
// validation, so a signed-out request learns nothing from a 400.
function requireSession(auth: Auth) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.routeOptions.config.public) return;
    const { response: session, headers } = await auth.api.getSession({
      headers: headersOf(request),
      returnHeaders: true,
    });
    if (!session) throw new ProblemError("unauthenticated", "Sign in to continue.");
    // A session more than a day old was just extended; send the refreshed
    // cookie so the browser's copy is extended too.
    forwardCookies(reply, headers);
    request.account = toAccount(session.user);
  };
}
