import { HealthResponse, MetaResponse, productName } from "@prayerteam/domain";
import swagger from "@fastify/swagger";
import Fastify, { type FastifyPluginAsync, type FastifyServerOptions } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import serverPackage from "../package.json" with { type: "json" };

// Everything the app needs from outside, passed in so tests can build an
// instance with their own config. Only main.ts reads the environment.
export interface AppConfig {
  logger: FastifyServerOptions["logger"];
  // Extra routes under /api for tests only, such as a handler that throws
  // or returns undeclared fields. Production never sets it.
  testRoutes?: FastifyPluginAsync;
}

// Builds a ready Fastify instance without listening. Tests call it with
// inject(); main.ts is the only caller that listens.
export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: config.logger }).withTypeProvider<ZodTypeProvider>();
  // Requests are validated and responses serialized through their Zod
  // schemas from `domain`, so the app and the API share one contract.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  // Collects every route registered after it into the OpenAPI document
  // (src/openapi.ts), converting the Zod schemas to JSON Schema.
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: { title: `${productName} API`, version: serverPackage.version },
    },
    transform: jsonSchemaTransform,
  });

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

      if (config.testRoutes) await api.register(config.testRoutes);
    },
    { prefix: "/api" },
  );

  await app.ready();
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
