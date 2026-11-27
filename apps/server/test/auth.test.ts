import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AccountEmailTakenError } from "../src/auth/accounts.ts";
import { expectUnauthenticated, me, origin, signIn, testAccount, testApp, testAuthConfig } from "./app.ts";

describe("sign-in", () => {
  it("with the right password starts a session that GET /api/me accepts", async () => {
    const app = await testApp();
    const account = await testAccount(app);
    const { response, cookie } = await signIn(app, account.email, account.password);
    expect(response.statusCode).toBe(200);
    const result = await me(app, cookie);
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ id: account.id, email: account.email, displayName: "Ann Example" });
  });

  it("sets an httpOnly, SameSite=Lax cookie scoped to /api, Secure only over https", async () => {
    for (const [baseUrl, secure] of [
      ["http://localhost:8081", false],
      ["https://prayer.example.org", true],
    ] as const) {
      const app = await testApp({ auth: testAuthConfig(baseUrl) });
      const account = await testAccount(app);
      const { setCookie } = await signIn(app, account.email, account.password, { origin: baseUrl });
      expect(setCookie, baseUrl).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/api" });
      expect(Boolean(setCookie?.secure), baseUrl).toBe(secure);
    }
  });

  it("ignores the email's case and surrounding spaces", async () => {
    const app = await testApp();
    const account = await testAccount(app, { email: "ann.example@example.org" });
    const { response } = await signIn(app, "  Ann.Example@EXAMPLE.org ", account.password);
    expect(response.statusCode).toBe(200);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const app = await testApp();
    const account = await testAccount(app);
    const wrongPassword = (await signIn(app, account.email, "not the password")).response;
    const unknownEmail = (await signIn(app, "nobody@example.org", "not the password")).response;
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(wrongPassword.statusCode);
    expect(unknownEmail.json()).toEqual(wrongPassword.json());
  });
});

describe("open sign-up", () => {
  it("is closed: the sign-up endpoint refuses and creates no Account", async () => {
    const app = await testApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin },
      payload: { email: "walk-in@example.org", password: "correct horse battery", name: "Walk In" },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect((await signIn(app, "walk-in@example.org", "correct horse battery")).response.statusCode).toBe(401);
  });
});

describe("protected routes", () => {
  it("refuse a request with no session, or a garbage one, with 401 unauthenticated", async () => {
    const app = await testApp();
    await expectUnauthenticated(await me(app));
    await expectUnauthenticated(await me(app, "better-auth.session_token=garbage"));
  });

  it("check the session before the input, so a signed-out request gets 401, not 400", async () => {
    const app = await testApp({
      testRoutes: async (api) => {
        api.withTypeProvider<ZodTypeProvider>().post(
          "/test/protected",
          { schema: { body: z.object({ text: z.string().min(1) }) } },
          async () => ({}),
        );
      },
    });
    const response = await app.inject({ method: "POST", url: "/api/test/protected", payload: { text: "" } });
    await expectUnauthenticated(response);
  });

  it("leave the public routes open", async () => {
    const app = await testApp();
    for (const url of ["/api/health", "/api/meta"]) {
      expect((await app.inject({ method: "GET", url })).statusCode, url).toBe(200);
    }
  });
});

describe("sign-out", () => {
  it("ends that session only", async () => {
    const app = await testApp();
    const account = await testAccount(app);
    const phone = await signIn(app, account.email, account.password);
    const laptop = await signIn(app, account.email, account.password);
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { origin, cookie: phone.cookie! },
    });
    expect(response.statusCode).toBe(200);
    await expectUnauthenticated(await me(app, phone.cookie));
    expect((await me(app, laptop.cookie)).statusCode).toBe(200);
  });
});

describe("createAccount", () => {
  it("refuses an email that is already taken, whatever its case", async () => {
    const app = await testApp();
    await testAccount(app, { email: "taken@example.org" });
    await expect(testAccount(app, { email: " Taken@Example.org" })).rejects.toThrow(/already/i);
  });

  it("lets only one of two simultaneous creates for the same email succeed", async () => {
    const app = await testApp();
    const results = await Promise.allSettled([
      testAccount(app, { email: "race@example.org" }),
      testAccount(app, { email: "race@example.org" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [rejected] = results.filter((r) => r.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(AccountEmailTakenError);
  });
});
