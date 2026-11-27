import {
  AppPlatform,
  AppVersion,
  appPlatformHeader,
  appVersionHeader,
  Problem,
  problemContentType,
} from "@prayerteam/domain";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import type { OpenAPIV3_1 } from "openapi-types";
import { z } from "zod";
import type { App } from "./app.ts";
import { unversionedRoutes } from "./version-check.ts";

// The OpenAPI document for every route on the app, built from their Zod
// schemas. `generate` commits it as openapi.json (ADR 0002).
export function openApiDocument(app: App): OpenAPIV3_1.Document {
  const document = structuredClone(app.swagger()) as OpenAPIV3_1.Document;
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    if (!item || unversionedRoutes.includes(path)) continue;
    for (const method of ["get", "put", "post", "delete", "patch"] as const) {
      const operation = item[method];
      if (operation) operation.parameters = [...(operation.parameters ?? []), ...appVersionParameters];
    }
  }
  return document;
}

// Two-space JSON with a trailing newline, so the committed file's diffs
// stay small and match what editors write.
export function formatOpenApiDocument(document: OpenAPIV3_1.Document): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

const jsonSchema = (schema: z.ZodType) => {
  const { $schema: _, ...rest } = z.toJSONSchema(schema);
  return rest as OpenAPIV3_1.SchemaObject;
};

// openapi-types gives a 3.1 parameter's schema its 3.0 schema type.
type ParameterSchema = OpenAPIV3_1.ParameterObject["schema"];

// Shared schemas and parameters, declared once under components.
export const openApiComponents: OpenAPIV3_1.ComponentsObject = {
  schemas: { Problem: jsonSchema(Problem) },
  parameters: {
    AppVersion: {
      in: "header",
      name: appVersionHeader,
      required: false,
      description: "The app's version, MAJOR.MINOR.PATCH. Below the platform's minimum: 426 upgrade_required.",
      schema: jsonSchema(AppVersion) as ParameterSchema,
    },
    AppPlatform: {
      in: "header",
      name: appPlatformHeader,
      required: false,
      description: "Required with the version header. web is never blocked.",
      schema: jsonSchema(AppPlatform) as ParameterSchema,
    },
  },
};

// Every operation except the unversioned routes takes the app version headers.
const appVersionParameters = [
  { $ref: "#/components/parameters/AppVersion" },
  { $ref: "#/components/parameters/AppPlatform" },
];

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
