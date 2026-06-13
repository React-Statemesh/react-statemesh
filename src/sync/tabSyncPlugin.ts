import { SyncError } from "../errors";
import { isBrowser, pickPaths } from "../utils";
import type { MeshPlugin } from "../core/types";
import { createBroadcastChannelTransport } from "./broadcastChannelAdapter";
import { createLocalStorageSyncTransport } from "./localStorageSyncAdapter";
import type { TabSyncMessage, TabSyncOptions } from "./syncTypes";

/**
 * Sync selected state paths across browser tabs.
 *
 * Uses `BroadcastChannel` when available and falls back to localStorage storage events. StateMesh includes
 * a source tab ID to prevent echo loops.
 *
 * @example
 * ```ts
 * mesh.use(tabSyncPlugin({
 *   keys: ["theme", "cart"],
 *   channel: "shopdesk-state"
 * }));
 * ```
 */
export function tabSyncPlugin<TState>(options: TabSyncOptions): MeshPlugin<TState> {
  const channelName = options.channel ?? "statemesh";
  const sourceTabId = options.sourceTabId ?? createSourceTabId();
  const keys = options.keys.filter((key) => !(options.blacklist ?? []).includes(key));

  return {
    name: `tab-sync:${channelName}`,
    setup({ mesh, emit }) {
      if (!isBrowser()) return;

      let applyingRemote = false;

      const onMessage = (message: TabSyncMessage) => {
        if (message.type !== "statemesh.sync" || message.sourceTabId === sourceTabId) return;
        applyingRemote = true;
        try {
          for (const key of message.keys) {
            mesh.setPath(key, message.values[key], {
              source: "tab-sync",
              sourceTabId: message.sourceTabId,
              timestamp: message.timestamp
            });
          }
          emit({
            type: "sync.received",
            sourceTabId: message.sourceTabId,
            keys: message.keys,
            timestamp: Date.now()
          });
        } catch (error) {
          throw new SyncError("StateMesh tab sync failed while applying a remote update.", {
            cause: error,
            metadata: { channel: channelName }
          });
        } finally {
          applyingRemote = false;
        }
      };

      const transport =
        createBroadcastChannelTransport(channelName, onMessage) ??
        createLocalStorageSyncTransport(channelName, onMessage);

      const unsubscribes = keys.map((key) =>
        mesh.subscribe(
          key,
          () => {
            if (applyingRemote) return;
            transport.post({
              type: "statemesh.sync",
              sourceTabId,
              keys,
              values: pickPaths(mesh.getState(), keys),
              timestamp: Date.now()
            });
          },
          { equality: Object.is }
        )
      );

      return () => {
        for (const unsubscribe of unsubscribes) unsubscribe();
        transport.close();
      };
    }
  };
}

function createSourceTabId(): string {
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
