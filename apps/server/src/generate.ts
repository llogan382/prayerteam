// Writes openapi.json from the app factory, without listening. CI runs it
// and fails if the committed file changes (ADR 0002).
import { createDatabase } from "@prayerteam/db";
import { writeFile } from "node:fs/promises";
import { buildApp } from "./app.ts";
import { offlineAuthConfig } from "./auth/auth.ts";
import { formatOpenApiDocument, openApiDocument } from "./openapi.ts";
import { noMinimumVersions } from "./version-check.ts";

// Nothing here reaches the database or the minimums, so any values do; the
// pool never connects.
const database = createDatabase({ connectionString: "postgres://unused/unused" });
const app = await buildApp({
  logger: false,
  minimumVersions: noMinimumVersions,
  database: database.db,
  auth: offlineAuthConfig,
});
await writeFile(new URL("../openapi.json", import.meta.url), formatOpenApiDocument(openApiDocument(app)));
await app.close();
await database.close();
