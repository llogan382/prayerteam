// The server's entry point: reads config from the environment, builds the
// app and listens. Nothing else listens; tests use buildApp directly.
import { buildApp } from "./app.ts";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT must be a port number, got ${JSON.stringify(process.env.PORT)}`);
}
const host = process.env.HOST ?? "0.0.0.0";

const app = await buildApp({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

// Docker and `node --watch` stop the process with SIGTERM or SIGINT; close
// Fastify so in-flight requests finish first.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ port, host });
