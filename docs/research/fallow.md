# Fallow: what it enforces and how it fits a TS monorepo

Research for [#3](https://github.com/llogan382/prayerteam/issues/3). Sources checked 2026-11-25 against fallow v3.48.0 (released 2026-11-24).

## What Fallow is

- A static analyzer for whole TypeScript/JavaScript projects. It builds the import graph from entry points and reports problems that span files. It is MIT-licensed, written in Rust, and ships as one native binary. The maker is Fallow B.V., a small bootstrapped company in the Netherlands founded in 2026. [About](https://fallow.tools/about), [repo](https://github.com/fallow-rs/fallow)
- It **complements a linter and formatter and does not replace them**. Fallow checks the whole project, and a linter checks one file at a time. We still need a linter (ESLint/Biome) and `tsc`. [Fallow vs linters](https://fallow.tools/docs/explanations/fallow-vs-linters/)
- It is young but active: the repo was created 2026-03-17, has about 5.4k stars, and gets near-daily releases on the v3 line. (`gh repo view fallow-rs/fallow`)

## What it checks

These analyses run by default ([docs index](https://fallow.tools/docs/index.md)):

| Area | Findings |
|---|---|
| Dead code | unused files, exports, types, class members, enum members |
| Dependencies | unused, missing, and misplaced `package.json` deps |
| Duplication | clone groups |
| Health | cyclomatic/cognitive complexity, file length, hotspots (from git churn), health score, CRAP (uses Vitest coverage) |
| Architecture | circular dependencies (no config needed), layer/boundary violations (needs config) |

Fallow also runs these when asked: styling (unused CSS-module classes, Tailwind drift), similar code, feature flags, security candidates, mutation testing, type-aware analysis, and runtime coverage.

**Severities** ([config-rules](https://fallow.tools/docs/reference/config-rules.md)): each issue type takes `error`, `warn`, or `off`. Only `error` changes the exit code.

- `error` by default: `unused-files`, `unused-exports`, `unresolved-imports`, `circular-dependencies`, `boundary-violation`, and `complexity-*` (thresholds are set with `health.maxCyclomatic`, `maxCognitive`, `maxCrap`, and `maxFileLines`).
- `warn` by default: dev/optional dependency rules, `stale-suppressions`, `re-export-cycle`, `package-cycle`, and clone groups.
- Off until enabled: `private-type-leaks`, `coverage-gaps`, `prop-drilling`.

Suppression comments exist, for example `// fallow-ignore-next-line unused-export`.

## Fit for our stack (Expo app + Node API + shared packages)

Built-in plugins switch on automatically when a matching dependency appears in `package.json`. Run `npx fallow list --plugins` to see which are active. [built-in plugins](https://fallow.tools/docs/frameworks/built-in.md)

| Our tool | Plugin? | What it does |
|---|---|---|
| React Native | yes (`react-native`) | understands platform files such as `Button.ios.tsx` |
| Expo / Expo Router | yes (`expo`, `expo-router`) | credits app-config fonts and native modules; Expo Router also handles platform files |
| Vitest | yes | test files become entry points; handles `vi.mock` → `__mocks__` |
| Playwright | yes | reads `testMatch` |
| TypeScript, Babel, ESLint | yes | no further detail in the docs |
| pnpm, Turborepo | yes | the pnpm plugin checks `catalog:` refs |
| Drizzle, Prisma | yes | no further detail in the docs |
| Metro | **no plugin listed** | Metro-specific resolution isn't documented |
| Node HTTP frameworks (Express/Fastify/Hono) | **no plugin listed** | the API's entry point comes from `package.json` `main`/`exports`/`bin`, or from `entry` in config |

**Monorepo behaviour** ([monorepo guide](https://fallow.tools/docs/guides/monorepo.md)):

- One run analyzes the whole repo. Workspaces come from the package manager's workspace config, or from `workspaces.patterns`. Imports between packages count as ordinary imports.
- `--workspace <pkg>` limits the report to one package, and `--changed-workspaces <ref>` limits it to changed packages.
- **Only the root config is read.** Per-package rules go in root `overrides` entries (keyed by a `files` glob). Per-package dependency ignores go in `workspaces.settings`.
- Package boundaries use `boundaries` zones and rules, e.g. `{ "from": "app", "allow": ["shared"] }`. One use: stop the client importing server-only code. [architecture](https://fallow.tools/docs/analysis/architecture/)

**Configuration** ([overview](https://fallow.tools/docs/configuration/overview.md)):

- Fallow works without a config file.
- An optional config is one of `.fallowrc.json`, `.fallowrc.jsonc` (both JSONC), `fallow.toml`, or `.fallow.toml`, at the repo root.
- `"$schema": "./node_modules/fallow/schema.json"` gives editor completion. `extends` accepts files or `npm:` packages.
- `fallow init` writes a starter config.

## Running it

**Locally** ([installation](https://fallow.tools/docs/installation/)):

- Install with `npm i -D fallow` (or pnpm/yarn/bun), then run `npx fallow`. The npm package **requires Node >= 22**.
- Prebuilt binaries exist for macOS, Linux (glibc and musl), and Windows.
- Also available: VS Code extension, LSP, an MCP server, and `fallow agent` hooks for Claude Code / Codex / Cursor. The hooks gate commits with `fallow audit`.

**In CI** ([first CI](https://fallow.tools/docs/start/first-ci/)): use the GitHub Action `fallow-rs/fallow@v3` with `command: audit` and `comment: true`.

- It needs `actions/checkout` with `fetch-depth: 0`, and a dependency install first, because Fallow reads `node_modules`.
- It needs permissions `pull-requests: write` and `checks: write`.
- `audit` reports only findings **the PR adds**: pass, warn, or fail, with exit code 1 on fail.
- It caches `.fallow` between runs.
- Outside GitHub, run `npx fallow audit --base origin/main --quiet`.
- SARIF output is supported ([home](https://fallow.tools/)).
- Baselines plus `--fail-on-regression` can ratchet down an existing backlog. A greenfield repo has no backlog, so we don't need them.

## Limits and costs

**Limits** ([limits](https://fallow.tools/docs/guides/limits.md)):

- Fallow doesn't follow a variable passed to `import()`. List such files under `dynamicallyLoaded`.
- It doesn't see files loaded by reflection or by DI string tokens.
- It doesn't see code that outside programs use. Mark such exports with `/** @public */`, or add the file to `entry`.
- It doesn't see config values computed at runtime, or bundler file replacements.
- It can't tell generated code from hand-written code. Use `ignorePatterns`.
- It skips dot-directories and `.md` files.
- Default analysis is syntax-only. The TS checker runs only when type-aware analysis is on.

For React Native/Expo, the docs cover only what the plugin table above lists, and they say nothing about Metro. Expect a few entry-point false positives, for example around Expo config plugins and `app.config.ts`. Fix them with `entry` globs.

**Costs** ([license](https://fallow.tools/docs/cli/license.md)):

- The CLI, the GitHub Action, and all static analyses are free (MIT). License checks run offline against a key built into the binary.
- Only **continuous runtime coverage** (Fallow Cloud) needs a paid license. A 30-day trial needs an email address. I found no public prices.
- v1 doesn't need Fallow Cloud.

## Implications for decision tickets

1. Use a package manager whose workspaces Fallow detects (pnpm has a dedicated plugin), with a single root `.fallowrc.jsonc`. Don't add per-package configs: Fallow ignores them.
2. Run `fallow-rs/fallow@v3` `audit` as a separate CI job, parallel to lint, typecheck, and test. On a greenfield repo the default `error` rules can be strict from the first commit.
3. Define `boundaries` zones for the app, the API, and the shared packages, so the client can't import server-only code.
4. CI runners and dev machines need Node >= 22, or the native binary.
5. Fallow doesn't replace a linter (ESLint or Biome) or `tsc --noEmit`. Both are still to be chosen.
