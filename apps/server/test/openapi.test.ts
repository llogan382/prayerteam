import { appPlatformHeader, appPlatforms, appVersionHeader, problemCodes, problemContentType } from "@prayerteam/domain";
import { describe, expect, it } from "vitest";
import { openApiDocument } from "../src/openapi.ts";
import { testApp } from "./app.ts";

describe("OpenAPI document", () => {
  it("contains every route, all under /api", async () => {
    const document = openApiDocument(await testApp());
    expect(document.openapi).toMatch(/^3\./);
    expect(Object.keys(document.paths ?? {}).sort()).toEqual(["/api/health", "/api/me", "/api/meta", "/api/placeholder-items"]);
  });

  it("describes responses from their Zod schemas", async () => {
    const document = openApiDocument(await testApp());
    const meta = document.paths?.["/api/meta"]?.get?.responses?.["200"];
    expect(meta).toMatchObject({
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { name: { type: "string" } },
            required: expect.arrayContaining(["name"]),
          },
        },
      },
    });
  });

  it("declares problem+json, one shared schema, as every operation's error response", async () => {
    const document = openApiDocument(await testApp());
    const methods = ["get", "put", "post", "delete", "patch"] as const;
    const operations = Object.entries(document.paths ?? {}).flatMap(([path, item]) =>
      methods.flatMap((method) => (item?.[method] ? [[`${method} ${path}`, item[method]] as const] : [])),
    );
    expect(operations.length).toBeGreaterThan(0);
    for (const [name, operation] of operations) {
      expect(operation.responses?.default, name).toEqual({
        description: expect.any(String),
        content: { [problemContentType]: { schema: { $ref: "#/components/schemas/Problem" } } },
      });
    }
    expect(document.components?.schemas?.Problem).toMatchObject({
      type: "object",
      properties: { code: { enum: [...problemCodes] } },
      required: expect.arrayContaining(["type", "title", "status", "code"]),
    });
  });

  it("declares the app version headers once, on every operation except health", async () => {
    const document = openApiDocument(await testApp());
    expect(document.components?.parameters).toMatchObject({
      AppVersion: { in: "header", name: appVersionHeader, required: false, schema: { type: "string" } },
      AppPlatform: { in: "header", name: appPlatformHeader, required: false, schema: { enum: [...appPlatforms] } },
    });
    const refs = [
      { $ref: "#/components/parameters/AppVersion" },
      { $ref: "#/components/parameters/AppPlatform" },
    ];
    for (const [path, item] of Object.entries(document.paths ?? {})) {
      const parameters = item?.get?.parameters ?? [];
      if (path === "/api/health") expect(parameters, path).not.toEqual(expect.arrayContaining([refs[0]]));
      else expect(parameters, path).toEqual(expect.arrayContaining(refs));
    }
  });
});
