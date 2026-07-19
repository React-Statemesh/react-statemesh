"use client";

import { StateMeshProvider, createMesh } from "@statemesh/react";
import type { ReactNode } from "react";

const mesh = createMesh({
  name: "nextjs-app",
  state: {
    theme: "light" as "light" | "dark"
  }
});

export function Providers({ children }: { children: ReactNode }) {
  return <StateMeshProvider mesh={mesh}>{children}</StateMeshProvider>;
}
