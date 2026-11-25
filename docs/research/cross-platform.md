# Cross-platform options: web + iOS + Android from one React Native codebase

Research for #4 (feeds the decision in #10). This file collects facts only. It makes no choice.
Sources were checked on 2026-11-25. Each one is linked inline where it is used.

## Question

For one React Native + TypeScript codebase that targets web, iOS, and Android, how does Expo (Expo Router + React Native Web) compare with the alternatives (bare RN plus a separate React web app, Solito/Next.js, etc.)? This covers web parity, code sharing, routing, auth/session handling, Playwright testability of the web build, and native E2E options.

## Short answer

- React Native's own docs **recommend a framework, naming Expo**, for new apps. Going without a framework is for "unusual constraints" ([reactnative.dev: environment setup](https://reactnative.dev/docs/environment-setup)).
- **Expo + Expo Router + React Native Web** is the only option here where one codebase and one router cover all three platforms, as Expo documents it: "Android, iOS, and web share a unified navigation structure" ([Expo Router intro](https://docs.expo.dev/router/introduction/)).
- **Solito + Next.js** is a two-app monorepo (a Next.js web app plus an Expo native app) with a shared navigation layer. Expo says Next.js "is not an official part of Expo's universal app development workflow" ([Expo: Using Next.js](https://docs.expo.dev/guides/using-nextjs/)).
- **Bare RN + a separate React web app** shares only non-UI code (types, API client, validation) unless you add React Native Web yourself. It also loses the framework benefits RN's docs describe.
- **Playwright** works against an Expo web build without special setup. RNW turns `testID` into `data-testid`, which is the attribute Playwright's `getByTestId` uses by default.
- **Native E2E**: Maestro is the tool in Expo's first-party EAS Workflows E2E guide and needs no app instrumentation. Detox is an alternative, but its main setup guide leaves Expo out.

## 1. Options compared

| Concern | Expo + Expo Router + RNW | Solito + Next.js (web) + Expo (native) | Bare RN + separate React web app |
|---|---|---|---|
| Apps / build tools | One app. Metro bundles every platform ([Expo web](https://docs.expo.dev/workflow/web/)) | Two apps in a monorepo. Next.js uses webpack config, and RN packages must go in `transpilePackages` ([Expo: Using Next.js](https://docs.expo.dev/guides/using-nextjs/)) | Two apps, two toolchains (Xcode/Gradle + a web bundler) |
| UI code sharing | Shared through RNW. DOM elements (`<div>`) don't render on native, so web-only code needs platform files ([Expo web](https://docs.expo.dev/workflow/web/)) | Shared through RNW inside Next.js | None by default. Logic only |
| Routing | One file-based router. Every screen can be deep-linked ([Expo Router intro](https://docs.expo.dev/router/introduction/)) | Next.js router on web, Expo/React Navigation on native. Solito unifies the navigation API ([solito README](https://github.com/nandorojo/solito)) | Two separate routers |
| Web rendering | `single` (SPA, the default), `static` (per-route HTML), `server` ([app config](https://docs.expo.dev/versions/latest/config/app/)) | Full Next.js SSR/SSG on web. The Expo adapter doesn't support the Next.js app directory ([Expo: Using Next.js](https://docs.expo.dev/guides/using-nextjs/)) | Whatever the web framework supports |
| Official standing | Recommended by RN docs | "not an official part of Expo's ... workflow" | "Without a framework" path in RN docs |

### Expo web details

- Web uses React Native for Web, "a compatibility layer between React DOM and React Native" ([RNW docs](https://necolas.github.io/react-native-web/docs/)). Install `react-dom`, `react-native-web`, and `@expo/metro-runtime`. Build with `npx expo export --platform web` ([Expo web](https://docs.expo.dev/workflow/web/)).
- `web.output` defaults to `single` ([app config](https://docs.expo.dev/versions/latest/config/app/)). `static` writes HTML files for each route. Any static host works (the docs list AWS Amplify among others), and no SPA redirects are needed. Dynamic routes need `generateStaticParams` ([static rendering](https://docs.expo.dev/router/web/static-rendering/)).
- SSR "currently requires custom infrastructure to set up" ([Expo Router intro](https://docs.expo.dev/router/introduction/)).
- API routes need `server` output (or `static` + `apiRoutes: true` on SDK 58+). Each host needs an adapter. `expo-server` ships adapters for Bun, Express, Netlify, and Vercel, with no AWS-specific one. Code is bundled into a single CommonJS file, so native binaries like `sharp` won't work ([API routes](https://docs.expo.dev/router/web/api-routes/)). Expo Hosting runs on Cloudflare Workers, which is relevant because the project is hosting on AWS ([Expo Hosting](https://docs.expo.dev/eas/hosting/introduction/)).
- Monorepos: Expo configures Metro for them automatically from SDK 52, with Bun, npm, pnpm, or Yarn workspaces ([Expo monorepos](https://docs.expo.dev/guides/monorepos/)). This matters if the backend lives in the same repo and shares types.

### Web parity gaps in React Native for Web

From the [RNW compatibility table](https://necolas.github.io/react-native-web/docs/react-native-compatibility/):

- **Not supported:** `RefreshControl`, `TouchableNativeFeedback`, `Alert`, `Settings`.
- **Partial:** `Image` (no multiple sources or HTTP headers), `ScrollView` (no momentum events), `Text` (no `onLongPress`), `TextInput` (no rich text or auto-expand), `Animated` (no `useNativeDriver`), `NativeModules` (mocked). `KeyboardAvoidingView`, `StatusBar`, `BackHandler`, and `Keyboard` are no-op mocks.
- Relevance to Prayer Team: pull-to-refresh (`RefreshControl`), confirmation dialogs (`Alert`), and long-press on text need a web fallback.
- Platform-specific files: inside `app/`, `.web.tsx`/`.native.tsx` route files are allowed "only if a non-platform version also exists". Outside `app/` there is no such restriction ([platform-specific modules](https://docs.expo.dev/router/reference/platform-specific-modules/)).

### Push notifications (v1 requirement)

`expo-notifications` lists **Android and iOS** as its platforms. The docs don't cover web push ([expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)). Web push would need separate work whichever option is chosen.

## 2. Auth / session handling per platform

- Expo Router's auth guide uses `Stack.Protected` with a `guard`, a `SessionProvider` context, and a splash screen held until the session loads. Its example "persists tokens securely on native with expo-secure-store and in local storage on web" ([Expo Router auth](https://docs.expo.dev/router/reference/authentication/)).
- Protected routes "are evaluated on the client side only" and are "not a replacement for server-side authentication or access control". Static builds still serve the JS/HTML files for protected routes to anyone who requests them ([protected routes](https://docs.expo.dev/router/advanced/protected/)). The API must enforce every authorization rule.
- `expo-secure-store` supports Android, iOS, and tvOS. Web isn't listed. It is backed by the iOS Keychain and by Android Keystore-encrypted SharedPreferences. Older iOS versions reportedly reject values over about 2 KB ([SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)).
- OWASP: "Do not store session identifiers in local storage as the data is always accessible by JavaScript". It suggests `httpOnly` cookies instead ([OWASP HTML5 cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)). This conflicts with Expo's example's web choice, so the decision ticket needs to weigh it. A common resolution is httpOnly cookies on web and bearer tokens in SecureStore on native, which makes the backend support two credential transports. That resolution is an inference, not documented by Expo.
- Expo Router on web "has no support for custom middleware or serving", so the guide recommends client-side redirects ([Expo Router auth](https://docs.expo.dev/router/reference/authentication/)). With Next.js (Solito), server middleware and httpOnly cookie sessions are available on web, but native still needs its own token path.

## 3. Playwright testability of the web build

- RNW maps `testID` to `data-testid`: `domProps['data-testid'] = testID;` ([RNW source, createDOMProps](https://github.com/necolas/react-native-web/blob/master/packages/react-native-web/src/modules/createDOMProps/index.ts)). Playwright's `getByTestId` uses `data-testid` by default ([Playwright locators](https://playwright.dev/docs/locators)). One `testID` therefore serves Playwright on web and Maestro on native (see below).
- Playwright recommends role locators first ([Playwright locators](https://playwright.dev/docs/locators)). Those depend on RNW producing correct ARIA roles. RNW marks its accessibility docs as changed ([RNW docs](https://necolas.github.io/react-native-web/docs/)).
- Playwright's `webServer` option can start the app before tests (`command`, `url`, `reuseExistingServer: !process.env.CI`) ([Playwright webServer](https://playwright.dev/docs/test-webserver)). For Expo this could be `npx expo start --web` or a static `npx expo export --platform web` followed by `npx expo serve`.
- Playwright covers **web only**. It doesn't drive iOS or Android apps, so the native builds need a separate E2E tool.

## 4. Native E2E options

### Maestro
- Flows are written in YAML ([Maestro docs](https://docs.maestro.dev/)). It works "at the accessibility layer ... requiring zero instrumentation". `testID` maps to the Maestro `id` selector ([Maestro: React Native](https://docs.maestro.dev/get-started/supported-platform/react-native.md)).
- Platforms: Android emulators and devices, and iOS simulators. The docs don't claim support for physical iOS devices. Web support is Beta and Chromium-only ([supported platforms](https://docs.maestro.dev/get-started/supported-platform.md), [web](https://docs.maestro.dev/get-started/supported-platform/web-browser.md)).
- First-party Expo integration: EAS Workflows can build an `.apk`/`.app` (with `simulator: true` for iOS) and run Maestro flows, either manually or on a `pull_request` trigger ([Expo E2E with Maestro](https://docs.expo.dev/eas/workflows/examples/e2e-tests/)). Pricing isn't covered on that page.

### Detox
- Gray-box testing for iOS and Android, with Jest as the default runner (Jest 29 recommended). You build binaries yourself with `xcodebuild`/Gradle, and Android setup needs native changes (`DetoxTest.java`, a network security config, ProGuard rules). "The setup for Expo projects is different and is not covered in this article" ([Detox project setup](https://wix.github.io/Detox/docs/introduction/project-setup)).
- Note: the project's test stack is Vitest + Playwright. Detox adds Jest as another runner.

## Open questions surfaced

1. **Web session transport**: should web use httpOnly cookies (OWASP) or localStorage tokens (Expo's example)? Does the backend support both cookies and bearer tokens?
2. **Web push**: `expo-notifications` documents only iOS and Android. Is web push in v1 scope?
3. **Web hosting on AWS**: a static/SPA export (`single`/`static`) can go on S3 + CloudFront or Amplify. Expo API routes have no AWS adapter, so is the API a separate service (likely, given Postgres on AWS)?
4. **Where Maestro runs**: in EAS Workflows (Expo's servers, pricing unverified) or self-hosted CI with simulators and emulators?
5. **SEO / public pages**: does anything need SSR (for example, Invite Link landing pages with previews)? Expo SSR needs custom infrastructure, and Next.js would provide it.
