import { describe, expect, it } from "vitest";
import { testApp } from "./app.ts";

describe("GET /api/meta", () => {
  it("returns the product name", async () => {
    const app = await testApp();
    const response = await app.inject({ method: "GET", url: "/api/meta" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
    expect(response.json()).toMatchObject({ name: "Prayer Team" });
  });
});

describe("routes", () => {
  it("live only under /api", async () => {
    const app = await testApp();
    for (const url of ["/health", "/meta"]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
    }
  });
});
