import { describe, expect, it } from "vitest";
import { openApiDocument } from "../src/openapi.ts";
import { testApp } from "./app.ts";

describe("OpenAPI document", () => {
  it("contains every route, all under /api", async () => {
    const document = openApiDocument(await testApp());
    expect(document.openapi).toMatch(/^3\./);
    expect(Object.keys(document.paths ?? {}).sort()).toEqual(["/api/health", "/api/meta"]);
  });

  it("describes responses from their Zod schemas", async () => {
    const document = openApiDocument(await testApp());
    const meta = document.paths?.["/api/meta"]?.get?.responses?.["200"];
    expect(meta).toMatchObject({
      content: {
        "application/json": {
          schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
        },
      },
    });
  });
});
