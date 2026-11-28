# Native smoke checklist for store releases

Run on a real iOS and a real Android build before each store submission. Maestro automates these once flows exist (#14); until then, run them by hand. The web is covered by Playwright in CI and is not on this list.

## Forced update (#42)

The API answers `426 upgrade_required` when a native app is older than its platform's minimum. The app then shows the forced-update screen in place of every route.

1. Point the build at an API whose minimum for this platform is above the build's version. Locally: start the server with `MIN_VERSION_IOS=99.0.0` (or `MIN_VERSION_ANDROID=99.0.0`), and set `EXPO_PUBLIC_API_URL` to it.
2. Open the app. The forced-update screen ("A new version of Prayer Team is ready") shows instead of the home screen.
3. Tap **Get the new version**. The store listing opens. Until listings exist, it opens the placeholder URL in `apps/mobile/src/forced-update.tsx`.
4. Set the minimum at or below the build's version and restart the app. The home screen shows the product name.
5. Raise only the other platform's minimum. This platform's build is not blocked.
