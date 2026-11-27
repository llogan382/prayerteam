import type { Database } from "@prayerteam/db";
import { schema } from "@prayerteam/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";

export interface AuthConfig {
  // Signs and encrypts session cookies and tokens. An SSM SecureString in
  // production (#34).
  secret: string;
  // The origin the app reaches the API on: the web app's own domain behind
  // CloudFront, so the cookie stays same-origin (ADR 0003, ADR 0005).
  baseUrl: string;
  // Origins allowed to make cookie-authenticated requests: the web
  // origin(s), and the app's URL scheme once native sign-in lands.
  trustedOrigins: string[];
}

const day = 60 * 60 * 24;

// Every path that takes an email treats " Ann@Example.org " as
// "ann@example.org" (#32).
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Better Auth (ADR 0003), configured as #32 decides. Its `user` is our
// Account (GLOSSARY.md), stored in the `account` table; its own `account`
// table, a sign-in method, is renamed `credential` to avoid the clash.
export function createAuth(db: Database, config: AuthConfig) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    secret: config.secret,
    baseURL: config.baseUrl,
    basePath: "/api/auth",
    trustedOrigins: config.trustedOrigins,
    user: { modelName: "account" },
    account: { modelName: "credential" },
    emailAndPassword: {
      enabled: true,
      // No open sign-up: Accounts are created by createAccount(), which the
      // joining flows and the seed call.
      disableSignUp: true,
      minPasswordLength: 8,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      // 90 days of use: each use more than a day after the last refresh
      // pushes the expiry forward again.
      expiresIn: 90 * day,
      updateAge: day,
      // Off, so a revoked session fails on its very next request.
      cookieCache: { enabled: false },
    },
    advanced: {
      // Postgres 18 generates UUIDv7 primary keys (packages/db conventions).
      database: { generateId: false },
      // Only /api reads the session; nothing else on the domain gets it.
      defaultCookieAttributes: { path: "/api" },
    },
    // Rate limiting is configured with database storage in a later slice
    // of #32.
    rateLimit: { enabled: false },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const body = ctx.body as { email?: unknown } | undefined;
        if (typeof body?.email === "string") {
          return { context: { body: { ...body, email: normaliseEmail(body.email) } } };
        }
        return undefined;
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

// For tools that build an Auth without serving requests: the schema
// generator, the OpenAPI generator and the seed. Nothing is signed with it.
export const offlineAuthConfig: AuthConfig = {
  secret: "offline-only-not-used-to-sign-anything",
  baseUrl: "http://localhost",
  trustedOrigins: [],
};
