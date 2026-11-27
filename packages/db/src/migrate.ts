import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./database.ts";

// The committed SQL migrations (`pnpm --filter @prayerteam/db db:generate`).
export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

// Applies every pending migration. A separate step, never at app start
// (#9, #15): `db:migrate` locally, the image's `migrate` command in
// production (#34), the template database in tests. It uses drizzle-orm's
// migrator rather than the drizzle-kit CLI #9 mentions: it applies the same
// committed SQL, and the production image then needs no dev tooling.
export async function migrateDatabase(connectionString: string): Promise<void> {
  const database = createDatabase({ connectionString, maxConnections: 1 });
  try {
    await migrate(database.db, { migrationsFolder });
  } finally {
    await database.close();
  }
}
