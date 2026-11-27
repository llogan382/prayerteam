import { useSyncExternalStore } from "react";

// Set once any API response is 426 upgrade_required; the root layout then
// shows the forced-update screen in place of every route. It lives in
// memory, so restarting the app clears it and the next request decides
// again.
let upgradeRequired = false;
const listeners = new Set<() => void>();

export function markUpgradeRequired(): void {
  if (upgradeRequired) return;
  upgradeRequired = true;
  for (const listener of listeners) listener();
}

export function useUpgradeRequired(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => upgradeRequired,
  );
}
