import type { Database } from "@prayerteam/db";
import { HealthResponse, MeResponse, MetaResponse, productName } from "@prayerteam/domain";
import swagger from "@fastify/swagger";
import Fastify, { type FastifyPluginAsync, type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import serverPackage from "../package.json" with { type: "json" };
import { type Accounts, type AuthConfig, createAccounts } from "./auth/accounts.ts";
import { openApiComponents, transformRoute } from "./openapi.ts";
import { placeholderRoutes } from "./placeholder.ts";
import { handleProblems } from "./problems.ts";
import { appVersionCheck, type MinimumVersionsProvider } from "./version-check.ts";

// Everything the app needs from outside, passed in so tests can build an
// instance with their own config. Only main.ts reads the environment.
export interface AppConfig {
  logger: FastifyServerOptions["logger"];
  // The iOS and Android minimum app versions, read on every checked request.
  minimumVersions: MinimumVersionsProvider;
  // The app's Postgres (packages/db). Better Auth's tables live there too.
  database: Database;
  auth: AuthConfig;
  // Extra routes under /api for tests only, such as a handler that throws
  // or returns undeclared fields. Protected like every route unless they set
  // `config: { public: true }`. Production never sets it.
  testRoutes?: FastifyPluginAsync;
}

declare module "fastify" {
  interface FastifyInstance {
    // Server-side Account operations, such as creating an Account.
    accounts: Accounts;
  }
}

// Builds a ready Fastify instance without listening. Tests call it with
// inject(); main.ts is the only caller that listens.
export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: config.logger }).withTypeProvider<ZodTypeProvider>();
  const accounts = createAccounts(config.database, config.auth);
  app.decorate("accounts", accounts);
  // Requests are validated and responses serialized through their Zod
  // schemas from `domain`, so the app and the API share one contract.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  handleProblems(app);
  // Collects every route registered after it into the OpenAPI document
  // (src/openapi.ts), converting the Zod schemas to JSON Schema and adding
  // the problem+json error response.
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: { title: `${productName} API`, version: serverPackage.version },
      components: openApiComponents,
    },
    transform: transformRoute,
  });

  await app.register(
    async (api) => {
      api.addHook("onRequest", appVersionCheck(config.minimumVersions));
      accounts.mount(api);

      // Liveness only: no database, and no app version check
      // (unversionedRoutes in version-check.ts).
      api.get(
        "/health",
        { config: { public: true }, schema: { response: { 200: HealthResponse } } },
        async () => ({ status: "ok" as const }),
      );

      api.get(
        "/meta",
        { config: { public: true }, schema: { response: { 200: MetaResponse } } },
        async () => ({ name: productName, minimumVersions: await config.minimumVersions() }),
      );

      // The signed-in Account (#32).
      api.get("/me", { schema: { response: { 200: MeResponse } } }, async (request) => request.account);

      await api.register(placeholderRoutes);

      if (config.testRoutes) await api.register(config.testRoutes);
    },
    { prefix: "/api" },
  );

  await app.ready();
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
