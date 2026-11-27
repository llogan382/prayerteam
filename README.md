# Prayer Team

One Expo app for iOS, Android and the web (ADR 0001), a Fastify API (ADR 0002) and AWS hosting defined in CDK (ADR 0005), in one pnpm + Turborepo workspace.

Needs Node 24 (`.nvmrc`) and pnpm 12 (`packageManager`; run `corepack enable` once).

## Commands

Run from the repository root.

| Command | What it does |
|---|---|
| `pnpm install` | Install every workspace package. |
| `pnpm dev` | Start the API (`node --watch`, port 3000) and the Expo dev server together. The web app reaches `/api` through the dev server's proxy. |
| `pnpm generate` | Write `apps/server/openapi.json` from the routes, then the typed client in `packages/api-client`. Commit both; CI fails if they are stale. |
| `pnpm typecheck` | Type-check every package that has a `typecheck` script. |
| `pnpm test` | Unit and integration tests: the API through `inject()`, and the CDK assertions. |
| `pnpm export:web` | Build the static web app into `apps/mobile/dist`. |
| `pnpm test:e2e` | Build the web app, start the API and a CloudFront-like static server, and run Playwright in Chromium and WebKit. |
| `pnpm run ci` | Everything CI runs: `typecheck`, `test`, `synth:check` (CDK synth with no AWS access) and `test:e2e`. |

`lint`, `format` and `format:check` arrive with #29.

## Packages

| Path | Package |
|---|---|
| `apps/mobile` | The Expo app (`expo start`; EAS profiles in `eas.json`). |
| `apps/server` | The API. Runs its TypeScript directly on Node, with no build step. |
| `packages/domain` | Zod schemas and types shared by the app and the API. |
| `packages/api-client` | The typed API client generated from `openapi.json`. |
| `infra` | AWS CDK stacks. `deploy/` holds the files that run on the API instance; see `deploy/README.md`. |
