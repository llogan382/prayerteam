// Writes openapi.json from the app factory, without listening. CI runs it
// and fails if the committed file changes (ADR 0002).
import { writeFile } from "node:fs/promises";
import { buildApp } from "./app.ts";
import { formatOpenApiDocument, openApiDocument } from "./openapi.ts";
import { noMinimumVersions } from "./version-check.ts";

// The minimums don't appear in the document; any values do.
const app = await buildApp({ logger: false, minimumVersions: noMinimumVersions });
await writeFile(new URL("../openapi.json", import.meta.url), formatOpenApiDocument(openApiDocument(app)));
await app.close();
