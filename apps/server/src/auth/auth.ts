import type { Database } from "@prayerteam/db";
import { schema } from "@prayerteam/db";
import { expo } from "@better-auth/expo";
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
  // origin(s). The app's own scheme is always added (appOrigin).
  trustedOrigins: string[];
}

// What the native app sends as its origin: its URL scheme (app.json), set
// by Better Auth's Expo client as the expo-origin header.
export const appOrigin = "prayerteam://";

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
    trustedOrigins: [...config.trustedOrigins, appOrigin],
    // Native apps keep the session in secure storage and send it as a
    // cookie header; the plugin takes their expo-origin as the Origin.
    plugins: [expo()],
    user: { modelName: "account" },
    account: { modelName: "credential" },
    emailAndPassword: {
      enabled: true,
      // No open sign-up: Accounts are created by Accounts.create()
      // (accounts.ts), which the joining flows and the seed call.
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
      // Explicit, because Better Auth turns both checks off when NODE_ENV is
      // "test", and the tests must see what production does.
      disableOriginCheck: false,
      disableCSRFCheck: false,
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
