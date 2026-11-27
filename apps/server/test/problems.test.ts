import { Problem, problemContentType } from "@prayerteam/domain";
import { Writable } from "node:stream";
import type { FastifyPluginAsync, LightMyRequestResponse } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { testApp } from "./app.ts";

// The response's problem, after checking it is problem+json that matches
// the shared contract exactly.
function problemOf(response: LightMyRequestResponse): Problem {
  expect(response.headers["content-type"]).toMatch(new RegExp(`^${problemContentType.replace("+", "\\+")}`));
  return Problem.strict().parse(response.json());
}

// The app's log lines, parsed, for checking what reached the server log.
function captureLogs() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(...String(chunk).trim().split("\n").map((line) => JSON.parse(line)));
      done();
    },
  });
  return { lines, logger: { level: "error", stream } };
}

describe("errors", () => {
  it("an unknown /api route is a 404 problem with code not_found", async () => {
    const app = await testApp();
    const response = await app.inject({ method: "GET", url: "/api/no-such-route" });
    expect(response.statusCode).toBe(404);
    expect(problemOf(response)).toMatchObject({ status: 404, code: "not_found", title: "Not Found" });
  });

  it("a crash is a 500 problem with code internal_error, logged but not leaked", async () => {
    const logs = captureLogs();
    const app = await testApp({
      logger: logs.logger,
      testRoutes: async (api) => {
        api.get("/test/crash", { config: { public: true } }, async () => {
          throw new Error("database password is hunter2");
        });
      },
    });
    const response = await app.inject({ method: "GET", url: "/api/test/crash" });
    expect(response.statusCode).toBe(500);
    expect(problemOf(response)).toEqual({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      code: "internal_error",
    });
    expect(response.body).not.toContain("hunter2");
    expect(JSON.stringify(logs.lines)).toContain("database password is hunter2");
  });

  // A test-only route with a validated query and body.
  const validated: FastifyPluginAsync = async (api) => {
    api.withTypeProvider<ZodTypeProvider>().post(
      "/test/validated",
      {
        config: { public: true },
        schema: {
          querystring: z.object({ limit: z.coerce.number().int().max(100).optional() }),
          body: z.object({ items: z.array(z.object({ name: z.string().min(1) })) }),
        },
      },
      async () => ({}),
    );
  };

  it.each([
    ["a query field", "/api/test/validated?limit=500", { items: [] }, ["limit"]],
    [
      "nested body fields",
      "/api/test/validated",
      { items: [{ name: "ok" }, { name: "" }, {}] },
      ["items.1.name", "items.2.name"],
    ],
  ])(
    "invalid %s is a 400 problem with code validation_failed naming each field",
    async (_, url, payload, paths) => {
      const app = await testApp({ testRoutes: validated });
      const response = await app.inject({ method: "POST", url, payload });
      expect(response.statusCode).toBe(400);
      const problem = problemOf(response);
      expect(problem).toMatchObject({ status: 400, code: "validation_failed", title: "Bad Request" });
      expect(problem.errors?.map((error) => error.path)).toEqual(paths);
    },
  );

  it("a malformed JSON body is a 400 problem, not a crash", async () => {
    const app = await testApp({ testRoutes: validated });
    const response = await app.inject({
      method: "POST",
      url: "/api/test/validated",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(response.statusCode).toBe(400);
    expect(problemOf(response)).toMatchObject({ status: 400, code: "validation_failed" });
  });
});
