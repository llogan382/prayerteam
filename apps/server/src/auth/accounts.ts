import { type Auth, normaliseEmail } from "./auth.ts";

// An Account as our code and API shapes see it (GLOSSARY.md). Better Auth
// calls it a user, and its `name` is our display name.
export interface Account {
  id: string;
  email: string;
  displayName: string;
}

export function toAccount(user: { id: string; email: string; name: string }): Account {
  return { id: user.id, email: user.email, displayName: user.name };
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

const uniqueViolation = "23505";

// Create Account (#32): the only way an Account comes into existence, since
// open sign-up is off. The joining flows (Invite Link, Email Invite) and the
// seed call it. #32 says to call Better Auth's server API, but its sign-up
// endpoint refuses while disableSignUp is on, so this makes the same two
// records through Better Auth's own context and password hasher: the
// Account, then its password credential. Re-check it against Better Auth's
// sign-up when upgrading.
export async function createAccount(
  auth: Auth,
  input: { email: string; password: string; displayName: string },
): Promise<Account> {
  const context = await auth.$context;
  const { minPasswordLength, maxPasswordLength } = context.password.config;
  if (input.password.length < minPasswordLength || input.password.length > maxPasswordLength) {
    throw new InvalidPasswordLengthError(minPasswordLength, maxPasswordLength);
  }
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

// Revoke all sessions for an Account (#32): every device is signed out, and
// the very next request from any of them gets 401 (the cookie cache is off).
// Member removal and Account deletion call it (#23); password reset and
// change revoke sessions inside Better Auth (ADR 0003). Like createAccount,
// it uses Better Auth's internal adapter: re-check it when upgrading.
export async function revokeAllSessions(auth: Auth, accountId: string): Promise<void> {
  const context = await auth.$context;
  await context.internalAdapter.deleteUserSessions(accountId);
}

function hasCode(error: unknown, code: string): boolean {
  for (let e: unknown = error; e; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === code) return true;
  }
  return false;
}
