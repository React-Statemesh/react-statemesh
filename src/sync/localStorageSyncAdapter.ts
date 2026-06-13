import { isBrowser } from "../utils";
import type { SyncTransport, TabSyncMessage } from "./syncTypes";

/**
 * Create a localStorage `storage` event fallback transport for cross-tab sync.
 *
 * This transport is SSR-safe and no-ops when `window` is unavailable.
 */
export function createLocalStorageSyncTransport(
  channelName: string,
  onMessage: (message: TabSyncMessage) => void
): SyncTransport {
  const storageKey = `${channelName}:message`;

  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey || !event.newValue) return;
    try {
      onMessage(JSON.parse(event.newValue) as TabSyncMessage);
    } catch {
      // Corrupted sync messages are ignored.
    }
  };

  if (isBrowser()) {
    window.addEventListener("storage", onStorage);
  }

  return {
    post(message) {
      if (!isBrowser()) return;
      window.localStorage.setItem(storageKey, JSON.stringify(message));
      window.localStorage.removeItem(storageKey);
    },
    close() {
      if (isBrowser()) {
        window.removeEventListener("storage", onStorage);
      }
    }
  };
}
