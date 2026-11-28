import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Platform } from "react-native";
import { queryClient } from "../api";
import { ForcedUpdate } from "../forced-update";
import { useUpgradeRequired } from "../upgrade";

export default function RootLayout() {
  // The web build is always the newest, so it is never forced to update.
  const forcedUpdate = useUpgradeRequired() && Platform.OS !== "web";
  return (
    <QueryClientProvider client={queryClient}>
      {forcedUpdate ? <ForcedUpdate /> : <Stack screenOptions={{ headerShown: false }} />}
    </QueryClientProvider>
  );
}
