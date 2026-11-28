// `pnpm db:migrate`: migrates DATABASE_URL (default: the Compose Postgres).
import { localDatabaseUrl } from "./database.ts";
import { migrateDatabase } from "./migrate.ts";

const url = process.env.DATABASE_URL ?? localDatabaseUrl("prayerteam");
await migrateDatabase(url);
console.log(`Migrated ${new URL(url).pathname.slice(1)}`);
