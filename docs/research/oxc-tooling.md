# Oxlint, oxfmt and TypeScript 7 for the monorepo

Sources checked 2026-11-26. Versions on npm that day:

| Package | Version | Released |
|---|---|---|
| `oxlint` | 1.95.0 | 2026-11-23 |
| `oxfmt` | 0.80.0 | 2026-11-23 |
| `oxlint-tsgolint` | 7.0.2008 | 2026-11-21 |
| `tsrs` (Rust type-aware backend) | 7.1.0-beta.tsrs5 | 2026-11-23 |
| `typescript` | 7.0.2 (`latest`), 7.1.0-beta (`beta`) | 7.0.2 on 2026-07-08 |
| `expo` | 58.0.26 (SDK 58 shipped 2026-10-15) | |

Sources: `npm view <pkg> dist-tags time`, [oxc releases](https://github.com/oxc-project/oxc/releases).

The claims marked **(verified)** were checked by hand in a throwaway project (outside the repo) with oxlint 1.95.0, oxlint-tsgolint 7.0.2008, oxfmt 0.80.0 and typescript 6.0.3 installed.

## Status at a glance

| Feature | Status | Source |
|---|---|---|
| Oxlint core | **Stable** (v1.0 since 2025-06-10) | [blog](https://oxc.rs/blog/2025-06-10-oxlint-stable.html) |
| Type-aware linting (tsgolint) | **Stable** since 2026-07-22 (alpha 2025-12-08, preview 2025-08-17) | [blog](https://oxc.rs/blog/2026-07-22-type-aware-linting-stable.html) |
| tsrs backend | **Beta** (`7.1.0-beta.*`). The post calls a "more stable release" a future goal | [blog 2026-11-17](https://oxc.rs/blog/2026-11-17-faster-type-aware-linting-with-tsrs.html) |
| React Compiler lint rules | No label on the rules. The Vite transform integration is called "experimental" | [blog 2026-08-18](https://oxc.rs/blog/2026-08-18-react-compiler-support.html) |
| JS plugins (ESLint plugin API) | **Alpha** since 2026-03-11 (preview 2025-10-09) | [blog](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha.html), [docs](https://oxc.rs/docs/guide/usage/linter/js-plugins.html) |
| oxfmt | **Beta** since 2026-02-24 (alpha 2025-12-01). It is still 0.x, and no stable post exists yet | [blog](https://oxc.rs/blog/2026-02-24-oxfmt-beta.html) |
| TypeScript 7.0 (native Go port) | **Stable** since 2026-07-08 | [TS blog](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) |

## 1. Type-aware linting (tsgolint / typescript-go)

- **Status:** stable. Oxlint ships 59–61 of typescript-eslint's 61–62 type-aware rules (the count depends on which page you read). [stable post](https://oxc.rs/blog/2026-07-22-type-aware-linting-stable.html), [docs](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
- **How to enable it:**
  1. `pnpm add -D oxlint oxlint-tsgolint`. `oxlint` 1.95.0 declares the peer dependency `oxlint-tsgolint >=7.0.2008`.
  2. Either set `"options": { "typeAware": true }` in the **root** config or pass `--type-aware`.
  3. Optionally set `"typeCheck": true` or pass `--type-check`. This also reports TypeScript compiler errors from the same program.
  4. The alternative backend is `pnpm add -D tsrs`. Oxlint picks it up automatically, and the post claims it is up to 5× faster with about 70% less memory, but it is beta.

  [docs](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
- **Rules:** `typescript/no-floating-promises` (correctness, on by default), `typescript/await-thenable` (correctness, on by default) and `typescript/no-misused-promises` (pedantic, off by default) all exist. [rules list](https://oxc.rs/docs/guide/usage/linter/rules.html). **(verified)** All three reported the expected errors on a test file.
- **TypeScript version:** tsgolint embeds TypeScript 7.0's Go checker, and tsrs is based on 7.1. You don't install TypeScript for tsgolint. Your tsconfig must follow **TypeScript 7 config rules**: options deprecated in 6.0 or removed in 7.0 (`baseUrl`, `moduleResolution: node10`, and others) are errors. The docs point to `ts5to6` for migrating tsconfigs. [docs](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
  - **(verified)** The project had `typescript@6.0.3` installed and a TS-7-clean tsconfig, and it linted fine. Adding `baseUrl` and `moduleResolution: node10` produced `typescript(tsconfig-error): Option 'baseUrl' has been removed` (see [tsgolint#351](https://github.com/oxc-project/tsgolint/issues/351)).
  - So a TS 6 project works as long as its tsconfig avoids options removed in 7. Expo's `expo/tsconfig.base.json` in SDK 58 uses `module: preserve`, `moduleResolution: bundler` and `customConditions: ["react-native"]` and has no `baseUrl`, so it is compatible. (Checked from the `expo@58.0.26` tarball.)
- **Monorepos and multiple tsconfigs:**
  - Each file is assigned to the TypeScript program of its nearest tsconfig, and programs are linted one at a time.
  - The docs recommend a solution-style root `tsconfig.json` with `"files": []`, and warn against broad `include` globs.
  - Dependent packages need their `.d.ts` built when packages resolve each other through build output.
  - `typeAware` and `typeCheck` are **root-config only**. [docs](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
  - **(verified)** With a root `{"files":[],"references":[…]}` and two packages that each have their own tsconfig, a cross-package floating promise was caught. Putting `options.typeAware` in a nested config fails with "only supported in the root config".
- **Caveats:**
  - `--type-check` only covers files Oxlint lints, so keep `tsc --noEmit` for full type checking.
  - Very large programs can use a lot of memory.

## 2. React support

- **Hooks rules:** `react/rules-of-hooks` and `react/exhaustive-deps` are native. The rules list puts rules-of-hooks in **pedantic** and exhaustive-deps in **correctness**, and neither is on by default, so enable them explicitly. Diagnostics print as `react-hooks(...)`. [rules list](https://oxc.rs/docs/guide/usage/linter/rules.html). **(verified)** Both fire.
- **React Compiler rules:** yes, since 2026-08-18. Oxlint has **22 native rules powered by the React Compiler**, under the `react/` prefix. They run the compiler's own validation passes and replace the old nursery `react/react-compiler` rule. Rule categories line up with the upstream ESLint presets. [blog](https://oxc.rs/blog/2026-08-18-react-compiler-support.html)
  - Correctness (recommended): `error-boundaries`, `globals`, `immutability`, `incompatible-library`, `preserve-manual-memoization`, `purity`, `refs`, `set-state-in-effect`, `set-state-in-render`, `static-components`, `use-memo`, `void-use-memo`.
  - Restriction (recommended): `unsupported-syntax`.
  - Off by default: `no-deriving-state-in-effects` (perf); `invariant`, `rule-suppression`, `syntax`, `todo` (restriction); `capitalized-calls`, `exhaustive-effect-dependencies`, `hooks`, `memo-dependencies` (suspicious).
  - Not implemented: `config`, `gating`, `fbt`, `memoized-effect-dependencies`. Compiler options are fixed, and gating is not exposed.
  - **(verified)** `react(set-state-in-render)` fired.
  - Fallback: the JS plugins conformance suite passes 100% of `eslint-plugin-react-hooks` tests, including the compiler rules. [JS plugins alpha](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha.html)
- **React Native:** there is **no native React Native plugin**. The native plugins are eslint, import, jest, jsdoc, jsx-a11y, nextjs, node, oxc, promise, react, react-perf, typescript, unicorn, vitest and vue. [rules list](https://oxc.rs/docs/guide/usage/linter/rules.html)
  - **(verified)** `eslint-plugin-react-native@5.0.0` loads as a JS plugin, and `react-native/no-inline-styles` and `react-native/no-unused-styles` both fired.
- **Gotcha (verified):** turning on the `suspicious` category enables `react/react-in-jsx-scope`, which is wrong for the automatic JSX runtime. Turn it off.

## 3. JS plugins (ESLint-compatible plugin API)

- **Status:** alpha. Use the `jsPlugins` field in the config, which accepts a package name, a path, or `{ "name", "specifier" }` for aliasing. Rules are then named `<plugin>/<rule>`. [docs](https://oxc.rs/docs/guide/usage/linter/js-plugins.html)
  - It targets the ESLint v9 API, "almost the entirety" of which is implemented, including fixes, suggestions, scope analysis, code paths, tokens and the LSP.
  - Not supported: custom parsers and file formats, and **rules that need TypeScript type information**.
  - Known issue: Windows out-of-memory reports.
- **eslint-plugin-drizzle 0.2.3:**
  - Both rules are purely syntactic `MemberExpression` checks and don't use `parserServices`. (Checked from the package source.)
  - **(verified)** They work. With `"jsPlugins": ["eslint-plugin-drizzle"]` and `"drizzle/enforce-delete-with-where": ["error", {"drizzleObjectName": ["db"]}]`, plus the same for update, both rules flagged `db.delete(users)` and `db.update(users).set(...)`.
  - The plugin's code requires `@typescript-eslint/utils` but does not list it as a dependency, so install it next to the plugin.
- **eslint-config-expo 58.0.4:**
  - It is a **shareable config, not a plugin**, and Oxlint has no way to load `eslint-config-*` presets. [docs](https://oxc.rs/docs/guide/usage/linter/js-plugins.html) covers plugins only.
  - The config bundles eslint-plugin-react, eslint-plugin-import, eslint-plugin-react-hooks 7, typescript-eslint and **eslint-plugin-expo 1.2.1**. The first four have native Oxlint equivalents.
  - **(verified)** `eslint-plugin-expo` loads as a JS plugin, and `expo/no-dynamic-env-var` and `expo/no-env-var-destructuring` fired. Its other rules are `use-dom-exports` and `prefer-box-shadow`.
  - `npx @oxlint/migrate eslint.config.js` can translate a flat config, but that route was not tested here.

## 4. Config (`.oxlintrc.json`), monorepo, strictness, Fallow overlap

- **Config files:** `.oxlintrc.json`, `.oxlintrc.jsonc`, `oxlint.config.ts` or `oxlint.config.mts`, one per directory. The TypeScript form is experimental and needs Node 22.18+ or 24+. [config docs](https://oxc.rs/docs/guide/usage/linter/config.html)
- **Nested configs:** each file uses its **nearest** config, and configs are **not merged automatically**.
  - A package config must declare `"extends": ["../../.oxlintrc.json"]` (a relative path; package specifiers only work in `oxlint.config.ts`).
  - Only `rules`, `plugins` and `overrides` are inherited.
  - `-c` or `--disable-nested-config` turns off nested lookup.
  - [nested config docs](https://oxc.rs/docs/guide/usage/linter/nested-config.html). **(verified)**
- **`plugins` replaces the default set,** so list every plugin you want. Leaving out `"import"` turns off every `import/*` rule, including `import/no-cycle`, which keeps Oxlint from duplicating Fallow's cycle, unused-file and unused-dependency checks.
  - `import/no-cycle` is in `restriction` and off by default anyway. `import/no-unused-modules` does not exist in Oxlint.
  - To be explicit, set `"import/no-cycle": "off"`.
- **Making everything an error:** there is no single "all rules" switch.
  - Set each category: `"categories": { "correctness": "error", "suspicious": "error", "pedantic": "error", "perf": "error" }`, and add `style` or `restriction` selectively. Then turn individual rules on or off under `rules`.
  - The CLI equivalent is `-D correctness -D suspicious …`.
- **Failing CI on warnings:** `--deny-warnings` gives a non-zero exit when any warning appears, and `--max-warnings=0` does the same. `--quiet` hides warnings.
  - **(verified)** With a warning-only file, the exit code is 0 plain, 1 with `--deny-warnings`, and 1 with `--max-warnings 0`.
- **Example root config:**

  ```jsonc
  {
    "plugins": ["typescript", "react", "unicorn", "oxc", "promise", "node", "vitest"],
    "jsPlugins": ["eslint-plugin-drizzle", "eslint-plugin-expo"],
    "options": { "typeAware": true },
    "categories": { "correctness": "error", "suspicious": "error", "pedantic": "error", "perf": "error" },
    "rules": {
      "react/rules-of-hooks": "error",
      "react/exhaustive-deps": "error",
      "react/react-in-jsx-scope": "off",
      "typescript/no-misused-promises": "error"
    }
  }
  ```

  Scope the drizzle and expo rules to `packages/db` / `apps/api` and `apps/app` with `overrides` or per-package `extends`.

## 5. oxfmt

- **Status:** **beta**, version 0.80.0 (2026-11-23). It passes 100% of Prettier's JS/TS conformance tests. [beta post](https://oxc.rs/blog/2026-02-24-oxfmt-beta.html)
  - Its output is based on Prettier's, with documented [divergences](https://oxc.rs/docs/guide/usage/formatter/migrate-from-prettier.html).
  - Prettier plugins are not supported yet; that is on the roadmap.
  - The **default `printWidth` is 100**, while Prettier uses 80. [config reference](https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html)
- **Languages:** JS, JSX, TS, TSX, JSON, JSONC, JSON5, YAML, TOML, HTML, Vue, Svelte, Angular, CSS, SCSS, Less, Markdown, MDX, GraphQL, Handlebars. [formatter docs](https://oxc.rs/docs/guide/usage/formatter.html). **(verified)** JSON, Markdown, YAML and CSS all format.
- **Config:** `.oxfmtrc.json`. `-c` also accepts `.jsonc`, `.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs`.
  - Bootstrap with `oxfmt --init`, or with `oxfmt --migrate=prettier` or `--migrate=biome`.
  - Nested configs are supported.
  - It reads `.gitignore` and `.prettierignore`, and `ignorePatterns` in the config. (`oxfmt --help`)
  - Built in, with no plugins needed: `sortImports` (off by default), `sortPackageJson` (on by default) and embedded CSS-in-JS formatting.
- **Tailwind class sorting:** the built-in `sortTailwindcss` replaces `prettier-plugin-tailwindcss` and is off by default.
  - Sub-options: `config` (Tailwind **v3** `tailwind.config.js`, found automatically), `stylesheet` (v4 CSS), `attributes` (added to `class`/`className`; exact match, no regex), `functions` (for example `["cn","clsx","cva"]`), `preserveWhitespace` and `preserveDuplicates`.
  - [sorting](https://oxc.rs/docs/guide/usage/formatter/sorting.html), [config reference](https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html)
  - **(verified, NativeWind):** with Tailwind 3 and a custom theme color, the `className` on RN `<View>`/`<Text>`, the `cn(...)` arguments and the custom `contentContainerClassName` attribute were all sorted in Tailwind order, and `bg-brand` from the custom theme was placed correctly.
  - Add each NativeWind `*ClassName` prop you use to `attributes`.
- **CI:** `oxfmt --check` exits 1 when something is unformatted. `--list-different` also exists. **(verified)** [CI docs](https://oxc.rs/docs/guide/usage/formatter/ci.html)
- **VS Code:**
  - Install the `oxc.oxc-vscode` extension. It runs the project's local `oxfmt --lsp`, so `oxfmt` must be a devDependency.
  - Set `"editor.defaultFormatter": "oxc.oxc-vscode"` and `"editor.formatOnSave": true`, optionally per language.
  - Add the extension to `.vscode/extensions.json` recommendations.
  - The same extension provides Oxlint diagnostics. [editors](https://oxc.rs/docs/guide/usage/formatter/editors.html)

## 6. Pre-commit with lint-staged

- **oxfmt:** the docs recommend `"lint-staged": { "*": "oxfmt --no-error-on-unmatched-pattern" }`, which formats only staged files of supported types and doesn't fail when none match. [formatter CI docs](https://oxc.rs/docs/guide/usage/formatter/ci.html)
- **oxlint:** the docs show `"*.{js,jsx,ts,tsx,mjs,cjs}": "pnpm run lint"`. That lints the whole repo; for staged files only, use `"oxlint --fix"`. lint-staged appends file paths, and Oxlint accepts them. [linter CI docs](https://oxc.rs/docs/guide/usage/linter/ci.html)
  - **(verified)** `oxlint --fix <abs path>` with type-aware linting on linted just that file, with type-aware rules working, because the program is still built from the tsconfig.
  - The docs say nothing about type-aware cost on staged-only runs. Expect each run to build the TypeScript program for the staged files' tsconfig(s).
  - The JS-plugin `--fix` path should work, but the drizzle rules provide no autofix.
- **Order:** run `oxlint --fix` before `oxfmt`, so the formatter tidies up after any fixes.

## 7. TypeScript 7 and Expo SDK 58

- **TypeScript 7.0 is stable:** 7.0.2 was released 2026-07-08 and is npm `latest`. 7.1.0-beta came out in October. [announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
  - The `typescript` package now ships the native compiler as **`tsc`**. `tsgo` / `@typescript/native-preview` was the preview name, and native-preview's last build is from 2026-07-07.
  - It **ships no programmatic JS API**; a new API is planned for 7.1.
  - Removed options are hard errors: `baseUrl`, `moduleResolution: node10`/`classic`, `target: es5`, and others.
  - Defaults changed: `strict` on, `module: esnext`, `types: []`.
  - `@typescript/typescript6` (bin `tsc6`) exists for side-by-side installs.
- **Expo SDK 58 does not support TypeScript 7:**
  - Expo's versions API lists `typescript: ~6.0.3` for SDK 58 (`https://api.expo.dev/v2/versions/latest`, `sdkVersions["58.0.0"].relatedPackages`), so `expo install --check` and `expo-doctor` will flag 7.x.
  - In July an Expo maintainer said "We don't yet support TypeScript v7" because it has no public API, and suggested installing TS 7 as a *secondary* package. Expo's CLI needs the TS API to load `app.config.ts`. [expo#47627](https://github.com/expo/expo/issues/47627) (closed 2026-07-21 with a Node `stripTypeScriptTypes` fallback; a "Support TypeScript 7.1" commit followed in October).
  - The SDK 58 changelog (2026-10-15) says nothing about TS 7. [changelog](https://expo.dev/changelog/sdk-58)
- **Using it for `--noEmit`:** this works in practice. Expo's tsconfig base is TS-7-clean, and TS 7 aims to match 6.0's type checking. Keep `typescript@~6.0.3` as the package Expo and other tools load, and add TS 7 under an npm alias (for example `"typescript-7": "npm:typescript@7.0.2"`) just for `tsc --noEmit`.
  - The type-aware lint and `--type-check` path already uses the TS 7 checker through tsgolint, whatever TypeScript version is installed.
  - This combination has no first-party endorsement from Expo; the advice is inferred from the sources above.

## Open points

- tsrs is beta. Stay on tsgolint (stable) until tsrs reaches a stable release.
- oxfmt is beta. Pin exact versions, because releases are weekly and formatting can shift between them.
- `react/rules-of-hooks` sits in the pedantic category, so enable it explicitly even if you skip pedantic.
