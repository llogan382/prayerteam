// The server's entry point: reads config from the environment, builds the
// app and listens. Nothing else listens; tests use buildApp directly.
import { createDatabase, localDatabaseUrl } from "@prayerteam/db";
import { MinimumVersions } from "@prayerteam/domain";
import { buildApp } from "./app.ts";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT must be a port number, got ${JSON.stringify(process.env.PORT)}`);
}
const host = process.env.HOST ?? "0.0.0.0";

// Fixed minimums from the environment for now; production reads them from
// SSM and refreshes them (#34). Invalid values stop startup.
const minimumVersions = MinimumVersions.parse({
  ios: process.env.MIN_VERSION_IOS ?? "0.0.0",
  android: process.env.MIN_VERSION_ANDROID ?? "0.0.0",
});

// Development defaults, so `pnpm dev` works with no setup: the Compose
// Postgres and the web app on the Expo dev server, which proxies /api. In
// production each is required (#34 builds this config from SSM).
const production = process.env.NODE_ENV === "production";
function setting(name: string, developmentDefault: string): string {
  const value = process.env[name];
  if (value) return value;
  if (production) throw new Error(`${name} must be set`);
  return developmentDefault;
}

const database = createDatabase({ connectionString: setting("DATABASE_URL", localDatabaseUrl("prayerteam")) });
const baseUrl = setting("AUTH_BASE_URL", "http://localhost:8081");

const app = await buildApp({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  minimumVersions: () => minimumVersions,
  database: database.db,
  auth: {
    secret: setting("AUTH_SECRET", "development-only-secret-not-for-production"),
    baseUrl,
    trustedOrigins: setting("AUTH_TRUSTED_ORIGINS", baseUrl).split(","),
  },
});

// Docker and `node --watch` stop the process with SIGTERM or SIGINT; close
// Fastify so in-flight requests finish first.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    void app
      .close()
      .then(() => database.close())
      .then(() => process.exit(0));
  });
}

await app.listen({ port, host });
