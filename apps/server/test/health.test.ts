import { describe, expect, it } from "vitest";
import { testApp } from "./app.ts";

describe("GET /api/health", () => {
  it("answers 200", async () => {
    const app = await testApp();
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
