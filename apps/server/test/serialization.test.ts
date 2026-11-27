import { MetaResponse } from "@prayerteam/domain";
import { describe, expect, it } from "vitest";
import { testApp } from "./app.ts";

describe("responses", () => {
  it("contain only the fields their schema declares", async () => {
    const app = await testApp({
      testRoutes: async (api) => {
        api.get("/test/leaky", { schema: { response: { 200: MetaResponse } } }, async () => ({
          name: "Prayer Team",
          passwordHash: "must not leak",
        }));
      },
    });
    const response = await app.inject({ method: "GET", url: "/api/test/leaky" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ name: "Prayer Team" });
  });
});
