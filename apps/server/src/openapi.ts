import { Problem, problemContentType } from "@prayerteam/domain";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import type { OpenAPIV3_1 } from "openapi-types";
import { z } from "zod";
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

// Shared schemas, declared once under components.schemas.
const { $schema: _, ...problemSchema } = z.toJSONSchema(Problem);
export const openApiComponents: OpenAPIV3_1.ComponentsObject = {
  schemas: { Problem: problemSchema as OpenAPIV3_1.SchemaObject },
};

// The swagger transform: each route's Zod schemas as JSON Schema, plus the
// problem+json response every route can give for any error status.
export const transformRoute: typeof jsonSchemaTransform = (input) => {
  const { schema, url } = jsonSchemaTransform(input);
  const response = {
    ...(schema.response as Record<string, unknown> | undefined),
    default: {
      description: "An error, as RFC 9457 problem+json. Branch on `code`.",
      content: { [problemContentType]: { schema: { $ref: "#/components/schemas/Problem" } } },
    },
  };
  return { schema: { ...schema, response }, url };
};
