import { Writable } from "node:stream";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { testApp } from "./app.ts";
import { expectProblem } from "./problem.ts";

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
    expect(expectProblem(response, "not_found")).toMatchObject({ title: "Not Found" });
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
    expect(expectProblem(response, "internal_error")).toEqual({
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
      const problem = expectProblem(response, "validation_failed");
      expect(problem.title).toBe("Bad Request");
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
    expectProblem(response, "validation_failed");
  });

  it.each([
    ["too large", 413, { "content-type": "application/json" }, JSON.stringify({ items: [{ name: "x".repeat(2_000_000) }] })],
    ["of an unsupported content type", 415, { "content-type": "text/csv" }, "name\nok"],
  ])("a body %s keeps its status as a validation_failed problem", async (_, status, headers, payload) => {
    const app = await testApp({ testRoutes: validated });
    const response = await app.inject({ method: "POST", url: "/api/test/validated", headers, payload });
    expect(expectProblem(response, "validation_failed", status).detail).toBeTruthy();
  });
});
