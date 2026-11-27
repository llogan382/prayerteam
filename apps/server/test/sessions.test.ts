import { Problem } from "@prayerteam/domain";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { App } from "../src/app.ts";
import { revokeAllSessions } from "../src/auth/accounts.ts";
import { appOrigin } from "../src/auth/auth.ts";
import { expectUnauthenticated, me, origin, sessionCookie, signIn, testAccount, testApp } from "./app.ts";

const dayMs = 24 * 60 * 60 * 1000;

// Better Auth reads the time from Date, which the tests control. Only Date
// is faked, so timers and the database pool behave normally.
function useClock() {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-01-01T09:00:00Z") });
  return { advance: (ms: number) => vi.setSystemTime(Date.now() + ms) };
}
afterEach(() => vi.useRealTimers());

describe("session expiry", () => {
  it("slides: a session used within every 90 days keeps working, with a refreshed cookie", async () => {
    const clock = useClock();
    const app = await testApp();
    const account = await testAccount(app);
    const signedIn = await signIn(app, account.email, account.password);
    // The cookie carries Max-Age, so it expires that long after it was set.
    const expiresAt = (setCookie: { maxAge?: number } | undefined) => Date.now() + setCookie!.maxAge! * 1000;
    let expires = expiresAt(signedIn.setCookie);
    for (let use = 1; use <= 3; use++) {
      clock.advance(80 * dayMs);
      const response = await me(app, signedIn.cookie);
      expect(response.statusCode, `use ${use}, ${use * 80} days in`).toBe(200);
      const refreshed = expiresAt(sessionCookie(response).setCookie);
      expect(refreshed, `use ${use}`).toBeGreaterThan(expires);
      expires = refreshed;
    }
  });

  it("ends: a session left unused for more than 90 days gets 401", async () => {
    const clock = useClock();
    const app = await testApp();
    const account = await testAccount(app);
    const { cookie } = await signIn(app, account.email, account.password);
    clock.advance(91 * dayMs);
    await expectUnauthenticated(await me(app, cookie));
  });
});

describe("revoke all sessions", () => {
  it("ends every session for that Account on its next request, and no one else's", async () => {
    const app = await testApp({
      testRoutes: async (api) => {
        api.post<{ Params: { id: string } }>("/test/accounts/:id/revoke", { config: { public: true } }, async (request) => {
          await revokeAllSessions(api.auth, request.params.id);
          return {};
        });
      },
    });
    const ann = await testAccount(app);
    const bob = await testAccount(app);
    const annPhone = await signIn(app, ann.email, ann.password);
    const annLaptop = await signIn(app, ann.email, ann.password);
    const bobPhone = await signIn(app, bob.email, bob.password);

    expect((await app.inject({ method: "POST", url: `/api/test/accounts/${ann.id}/revoke` })).statusCode).toBe(200);

    await expectUnauthenticated(await me(app, annPhone.cookie));
    await expectUnauthenticated(await me(app, annLaptop.cookie));
    expect((await me(app, bobPhone.cookie)).statusCode).toBe(200);
  });
});

describe("native apps", () => {
  it("authenticate with the session the Expo plugin stores and sends as a cookie header", async () => {
    const app = await testApp();
    const account = await testAccount(app);
    // The Expo client sends no Origin; it names the app's scheme instead.
    const native = { "expo-origin": appOrigin };
    const { response, cookie } = await signIn(app, account.email, account.password, native);
    expect(response.statusCode).toBe(200);
    const result = await me(app, cookie, native);
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ id: account.id });

    // A cookie-authenticated auth request from the app passes the origin check.
    const signOut = await app.inject({ method: "POST", url: "/api/auth/sign-out", headers: { ...native, cookie: cookie! } });
    expect(signOut.statusCode).toBe(200);
    await expectUnauthenticated(await me(app, cookie, native));
  });
});

describe("trusted origins", () => {
  it("include the app's own URL scheme, as app.json sets it", () => {
    const appConfig = JSON.parse(readFileSync(new URL("../../mobile/app.json", import.meta.url), "utf8"));
    expect(appOrigin).toBe(`${appConfig.expo.scheme}://`);
  });

  it("refuse a cookie-authenticated auth request from another site", async () => {
    const app = await testApp();
    const account = await testAccount(app);
    const { cookie } = await signIn(app, account.email, account.password);
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { origin: "https://attacker.example", cookie: cookie! },
    });
    expect(response.statusCode).toBe(403);
    expect((await me(app, cookie)).statusCode).toBe(200);
  });
});

describe("app version on auth routes", () => {
  const signInAs = async (app: App, email: string, password: string, platform: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { origin, "x-app-version": "1.0.0", "x-app-platform": platform },
      payload: { email, password },
    });

  it("gives an outdated native app 426 before Better Auth sees the request, and never blocks web", async () => {
    const app = await testApp({ minimumVersions: () => ({ ios: "5.0.0", android: "5.0.0" }) });
    const account = await testAccount(app);
    for (const platform of ["ios", "android"]) {
      const response = await signInAs(app, account.email, account.password, platform);
      expect(response.statusCode, platform).toBe(426);
      expect(Problem.parse(response.json())).toMatchObject({ code: "upgrade_required" });
      expect(response.cookies, platform).toEqual([]);
    }
    expect((await signInAs(app, account.email, account.password, "web")).statusCode).toBe(200);
  });
});
