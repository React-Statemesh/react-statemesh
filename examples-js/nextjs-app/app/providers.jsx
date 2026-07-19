"use client";

import { StateMeshProvider, createMesh } from "@statemesh/react";

const mesh = createMesh({
  name: "nextjs-app-js",
  state: {
    theme: "light"
  }
});

export function Providers({ children }) {
  return <StateMeshProvider mesh={mesh}>{children}</StateMeshProvider>;
}
