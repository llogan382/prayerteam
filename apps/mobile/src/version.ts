import Constants from "expo-constants";

// The app's own version: `expo.version` in app.json, embedded in every
// build (eas.json reads it locally, so the store binary agrees). The API's
// forced-update check compares it with each platform's minimum (ADR 0002).
export function appVersion(): string {
  const version = Constants.expoConfig?.version;
  if (!version) throw new Error("expo.version is missing from app.json");
  return version;
}
