import { createApiClient, retryUnlessClientError } from "@prayerteam/api-client";
import { QueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";
import { markUpgradeRequired } from "./upgrade";
import { appVersion } from "./version";

// Where the API is. On the web it is same-origin /api, behind CloudFront in
// production (ADR 0005) and the test server's proxy in e2e. Native apps use
// EXPO_PUBLIC_API_URL; in development they fall back to the Metro dev
// server, which proxies /api to the local API (metro.config.js).
function apiBaseUrl(): string {
  if (Platform.OS === "web") return "";
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured;
  const devServer = Constants.expoConfig?.hostUri;
  if (__DEV__ && devServer) return `http://${devServer}`;
  throw new Error("EXPO_PUBLIC_API_URL must be set for a native build");
}

export const api = createApiClient({
  baseUrl: apiBaseUrl(),
  // expo/fetch takes the Request objects openapi-fetch passes; its own
  // types just don't name the DOM ones.
  fetch: expoFetch as unknown as typeof globalThis.fetch,
  app: { version: appVersion(), platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web" },
  onUpgradeRequired: markUpgradeRequired,
});

// In-memory cache only: persistence waits for the offline decision (#31).
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: retryUnlessClientError } },
});
