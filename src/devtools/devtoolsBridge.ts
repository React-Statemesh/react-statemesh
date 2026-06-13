import type { MeshEvent, MeshPlugin } from "../core/types";

/** Minimal bridge interface for future devtools integrations. */
export type DevtoolsBridge = {
  /** Receive a StateMesh event. */
  send: (event: MeshEvent) => void;
};

/** Create a plugin that forwards StateMesh events to a devtools bridge. */
export function devtoolsBridgePlugin<TState>(bridge: DevtoolsBridge): MeshPlugin<TState> {
  return {
    name: "devtools-bridge",
    setup({ onEvent }) {
      return onEvent((event) => bridge.send(event));
    }
  };
}
