import { createTestDatabase } from "@prayerteam/db/testing";
import type { LightMyRequestResponse } from "fastify";
import { afterAll, afterEach } from "vitest";
import { buildApp, type App, type AppConfig } from "../src/app.ts";
import { noMinimumVersions } from "../src/version-check.ts";

// Each test file gets its own copy of the migrated database (#14).
const database = await createTestDatabase();
afterAll(() => database.close());

export const origin = "http://localhost:8081";

// Builds an app from the factory for one test and closes it afterwards.
const open: App[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

export async function testApp(config: Partial<AppConfig> = {}): Promise<App> {
  const app = await buildApp({
    logger: false,
    minimumVersions: noMinimumVersions,
    database: database.db,
    auth: testAuthConfig(origin),
    ...config,
  });
  open.push(app);
  return app;
}

// A new Account with a unique email, created the way the joining flows will.
export async function testAccount(app: App, overrides: { email?: string; password?: string } = {}) {
  const email = overrides.email ?? `account-${crypto.randomUUID()}@example.org`;
  const password = overrides.password ?? "correct horse battery";
  const account = await app.accounts.create({ email, password, displayName: "Ann Example" });
  return { ...account, password };
}

// The session cookie a response set, if any: `setCookie` with its
// attributes, and `cookie`, the header to send on later requests.
export function sessionCookie(response: LightMyRequestResponse) {
  const setCookie = response.cookies.find((c) => c.name.endsWith("session_token"));
  return { setCookie, cookie: setCookie ? `${setCookie.name}=${setCookie.value}` : undefined };
}

// Signs in through the HTTP API. By default as the web app on `origin`;
// pass other headers to sign in as a native app does.
export async function signIn(app: App, email: string, password: string, headers: Record<string, string> = { origin }) {
  const response = await app.inject({ method: "POST", url: "/api/auth/sign-in/email", headers, payload: { email, password } });
  return { response, ...sessionCookie(response) };
}

// GET /api/me with an optional session cookie and extra headers.
export function me(app: App, cookie?: string, headers: Record<string, string> = {}) {
  return app.inject({ method: "GET", url: "/api/me", headers: { ...headers, ...(cookie ? { cookie } : {}) } });
}

export const testAuthConfig = (baseUrl: string) => ({
  secret: "test-secret-at-least-32-characters-long",
  baseUrl,
  trustedOrigins: [baseUrl],
});
