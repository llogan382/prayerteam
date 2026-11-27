// Real Postgres for tests (#14). Once per test run, prepareTemplateDatabase()
// migrates a template database. Each test file then takes its own copy with
// createTestDatabase(), which Postgres makes in milliseconds, so files run
// in parallel and never see each other's writes.
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import pg from "pg";
import { createDatabase, localDatabaseUrl } from "./database.ts";
import { migrateDatabase } from "./migrate.ts";

// One template per package (its directory name), because turbo runs the
// packages' test tasks at the same time and each run recreates its template.
const template = `prayerteam_test_template_${basename(process.cwd()).replaceAll(/[^a-z0-9]/g, "_")}`;

// A server login that may create databases: the Compose Postgres locally,
// the service container in CI.
const adminUrl = process.env.DATABASE_ADMIN_URL ?? localDatabaseUrl("postgres");

const undefinedDatabase = "3D000";

function urlFor(database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function asAdmin<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

// Vitest globalSetup: a freshly migrated template, marked as a template so
// nothing connects to it while copies are made.
export async function prepareTemplateDatabase(): Promise<void> {
  await asAdmin(async (client) => {
    // A template can't be dropped; an earlier run's must be unmarked first.
    await client.query(`alter database ${template} with is_template false`).catch((error: { code?: string }) => {
      if (error.code !== undefinedDatabase) throw error;
    });
    await client.query(`drop database if exists ${template} with (force)`);
    await client.query(`create database ${template}`);
  });
  await migrateDatabase(urlFor(template));
  await asAdmin((client) => client.query(`alter database ${template} with is_template true allow_connections false`));
}

// A new copy of the template; close() drops it.
export async function createTestDatabase() {
  const name = `prayerteam_test_${randomUUID().replaceAll("-", "")}`;
  await asAdmin((client) => client.query(`create database ${name} template ${template}`));
  const connectionString = urlFor(name);
  const database = createDatabase({ connectionString, maxConnections: 4 });
  return {
    ...database,
    connectionString,
    async close() {
      await database.close();
      await asAdmin((client) => client.query(`drop database if exists ${name} with (force)`));
    },
  };
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;
