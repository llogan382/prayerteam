// Only for Better Auth's CLI, which generates its tables into packages/db
// (`pnpm --filter @prayerteam/server auth:generate`). Nothing connects: the
// CLI reads the configuration, not the database.
import { createDatabase } from "@prayerteam/db";
import { createAuth, offlineAuthConfig } from "./auth.ts";

export const auth = createAuth(createDatabase({ connectionString: "postgres://unused/unused" }).db, offlineAuthConfig);
