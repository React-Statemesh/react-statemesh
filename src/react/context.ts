import { createContext } from "react";
import type { Mesh } from "../core/types";

/** React context used internally by `StateMeshProvider` and `useMesh`. */
export const StateMeshContext = createContext<Mesh<unknown> | null>(null);
