import { z } from "zod";

// Every request from the app says which app it is (ADR 0002, #42). The API
// answers 426 upgrade_required when a native app is below its platform's
// minimum. The web build is always the newest, so it has no minimum.
export const appVersionHeader = "x-app-version";
export const appPlatformHeader = "x-app-platform";

export const appPlatforms = ["ios", "android", "web"] as const;
export const AppPlatform = z.enum(appPlatforms);
export type AppPlatform = z.infer<typeof AppPlatform>;

// MAJOR.MINOR.PATCH: the semver core, which is all app.json's version uses.
// Pre-release and build suffixes are rejected rather than ordered.
export const AppVersion = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
export type AppVersion = z.infer<typeof AppVersion>;

// Negative, zero or positive as `a` is older than, the same as or newer
// than `b`, comparing each part as a number (so 3.10.0 is newer than 3.9.0).
export function compareAppVersions(a: AppVersion, b: AppVersion): number {
  const [aMajor, aMinor, aPatch] = a.split(".").map(Number) as [number, number, number];
  const [bMajor, bMinor, bPatch] = b.split(".").map(Number) as [number, number, number];
  return aMajor - bMajor || aMinor - bMinor || aPatch - bPatch;
}

// The oldest app version each native platform may still use.
export const MinimumVersions = z.object({
  ios: AppVersion,
  android: AppVersion,
});
export type MinimumVersions = z.infer<typeof MinimumVersions>;
