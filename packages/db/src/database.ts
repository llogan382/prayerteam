import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

export interface DatabaseOptions {
  connectionString: string;
  // The pool's size. Small: the server runs two of them on a db.t4g.micro
  // during a blue/green deploy (#34).
  maxConnections?: number;
}

// A Drizzle database over its own bounded `pg` pool. Queries import their
// tables from `schema`; Drizzle v1's `relations` config is added when the
// first related tables arrive.
export function createDatabase({ connectionString, maxConnections = 10 }: DatabaseOptions) {
  const pool = new pg.Pool({ connectionString, max: maxConnections });
  const db = drizzle({ client: pool });
  return { db, pool, close: () => pool.end() };
}

export type Database = ReturnType<typeof createDatabase>["db"];

// The Compose Postgres (compose.yaml): host port 54320, so it never clashes
// with a Postgres installed on the host.
export function localDatabaseUrl(database: string): string {
  return `postgres://prayerteam:prayerteam@127.0.0.1:54320/${database}`;
}
