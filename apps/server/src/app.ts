import { HealthResponse, MetaResponse, productName } from "@prayerteam/domain";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

// Everything the app needs from outside, passed in so tests can build an
// instance with their own config. Only main.ts reads the environment.
export interface AppConfig {
  logger: FastifyServerOptions["logger"];
}

// Builds a ready Fastify instance without listening. Tests call it with
// inject(); main.ts is the only caller that listens.
export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: config.logger }).withTypeProvider<ZodTypeProvider>();
  // Requests are validated and responses serialized through their Zod
  // schemas from `domain`, so the app and the API share one contract.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(
    async (api) => {
      // Liveness only: no database, and exempt from the app version check
      // that #42 adds (#31).
      api.get(
        "/health",
        { schema: { response: { 200: HealthResponse } } },
        async () => ({ status: "ok" as const }),
      );

      api.get(
        "/meta",
        { schema: { response: { 200: MetaResponse } } },
        async () => ({ name: productName }),
      );
    },
    { prefix: "/api" },
  );

  await app.ready();
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
