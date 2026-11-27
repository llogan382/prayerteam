import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ProblemError } from "../problems.ts";
import { type Account, toAccount } from "./accounts.ts";
import type { Auth } from "./auth.ts";

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

function headersOf(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

// Better Auth's own endpoints under /api/auth/*, inside the Fastify app so
// the app-version check and logging apply to them. They are Better Auth's
// shapes, not ours, so they stay out of openapi.json (ADR 0003).
export function mountAuth(api: FastifyInstance, auth: Auth, baseUrl: string): void {
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
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);
      return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
    },
  });
}

// The onRequest hook that authenticates every non-public route, and only
// authenticates (ADR 0004): no valid session is 401 unauthenticated. It runs
// before validation, so a signed-out request learns nothing from a 400.
export function requireSession(auth: Auth) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.routeOptions.config.public) return;
    const { response: session, headers } = await auth.api.getSession({
      headers: headersOf(request),
      returnHeaders: true,
    });
    if (!session) throw new ProblemError(401, "unauthenticated", "Sign in to continue.");
    // A session more than a day old was just extended; send the refreshed
    // cookie so the browser's copy is extended too.
    const cookies = headers.getSetCookie();
    if (cookies.length > 0) reply.header("set-cookie", cookies);
    request.account = toAccount(session.user);
  };
}
