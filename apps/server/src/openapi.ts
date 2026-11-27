import type { OpenAPIV3_1 } from "openapi-types";
import type { App } from "./app.ts";

// The OpenAPI document for every route on the app, built from their Zod
// schemas. `generate` commits it as openapi.json (ADR 0002).
export function openApiDocument(app: App): OpenAPIV3_1.Document {
  return app.swagger() as OpenAPIV3_1.Document;
}

// Two-space JSON with a trailing newline, so the committed file's diffs
// stay small and match what editors write.
export function formatOpenApiDocument(document: OpenAPIV3_1.Document): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
