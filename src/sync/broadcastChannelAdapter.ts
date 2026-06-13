import { isBrowser } from "../utils";
import type { SyncTransport, TabSyncMessage } from "./syncTypes";

/**
 * Create a BroadcastChannel sync transport when the browser supports it.
 *
 * Returns `null` during SSR or in browsers without `BroadcastChannel`.
 */
export function createBroadcastChannelTransport(
  channelName: string,
  onMessage: (message: TabSyncMessage) => void
): SyncTransport | null {
  if (!isBrowser() || typeof BroadcastChannel === "undefined") return null;

  const channel = new BroadcastChannel(channelName);
  channel.onmessage = (event: MessageEvent<TabSyncMessage>) => {
    onMessage(event.data);
  };

  return {
    post: (message) => channel.postMessage(message),
    close: () => channel.close()
  };
}
