import type { MeshPath } from "../core/types";

/** Conflict strategy used by tab sync. V1 supports latest update wins. */
export type TabSyncStrategy = "latest-wins";

/** Options for `tabSyncPlugin`. */
export type TabSyncOptions = {
  /** Whitelisted state paths to sync across tabs. */
  keys: readonly string[];
  /** Paths to exclude from syncing. */
  blacklist?: readonly string[];
  /** Broadcast/storage channel name. */
  channel?: string;
  /** Conflict strategy. Defaults to `"latest-wins"`. */
  strategy?: TabSyncStrategy;
  /** Optional fixed tab ID, mostly useful for tests. */
  sourceTabId?: string;
};

/** Internal sync message sent between browser tabs. */
export type TabSyncMessage = {
  type: "statemesh.sync";
  sourceTabId: string;
  keys: string[];
  values: Record<string, unknown>;
  timestamp: number;
};

/** Transport abstraction used by BroadcastChannel and localStorage fallback sync. */
export type SyncTransport = {
  post: (message: TabSyncMessage) => void;
  close: () => void;
};

/** Path type used by sync APIs. */
export type SyncPath = MeshPath;
