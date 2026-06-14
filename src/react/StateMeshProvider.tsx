import { useEffect, type ReactNode } from "react";
import type { Mesh } from "../core/types";
import { StateMeshContext } from "./context";

/** Props for `StateMeshProvider`. */
export type StateMeshProviderProps<TState> = {
  /** Mesh instance created with `createMesh`. */
  mesh: Mesh<TState>;
  /** React subtree that can use StateMesh hooks. */
  children: ReactNode;
  /**
   * Force a real browser reload on Vite development updates/errors.
   *
   * Defaults to true. This prevents Vite Fast Refresh from keeping the last successful UI visible
   * after a broken save, so missing imports and wrong runtime names fail immediately.
   */
  devForceFullReload?: boolean;
};

/**
 * Provides a StateMesh instance to React hooks.
 *
 * The provider stores only the mesh instance in context. State updates happen in the external store,
 * so the provider itself does not rerender for every state change.
 *
 * @example
 * ```tsx
 * <StateMeshProvider mesh={mesh}>
 *   <App />
 * </StateMeshProvider>
 * ```
 *
 * In Vite development, the provider connects to Vite's dev WebSocket and forces a full page reload
 * on hot updates/errors by default. This keeps broken saves from leaving the last successful React
 * tree visible.
 */
export function StateMeshProvider<TState>({
  mesh,
  children,
  devForceFullReload = true
}: StateMeshProviderProps<TState>) {
  useStateMeshDevFullReload(devForceFullReload);

  return <StateMeshContext.Provider value={mesh as Mesh<unknown>}>{children}</StateMeshContext.Provider>;
}

function useStateMeshDevFullReload(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    return startStateMeshViteReloadGuard();
  }, [enabled]);
}

type ViteHotPayload = {
  type?: string;
  event?: string;
};

type StateMeshViteReloadSession = {
  refs: number;
  close: () => void;
};

type StateMeshConsoleMethod = "debug" | "error" | "info" | "log" | "warn";

let viteReloadSession: StateMeshViteReloadSession | null = null;

function startStateMeshViteReloadGuard(): () => void {
  if (!canUseViteReloadGuard()) return () => undefined;

  if (!viteReloadSession) {
    viteReloadSession = createStateMeshViteReloadSession();
  }

  viteReloadSession.refs += 1;

  return () => {
    if (!viteReloadSession) return;

    viteReloadSession.refs -= 1;
    if (viteReloadSession.refs <= 0) {
      viteReloadSession.close();
      viteReloadSession = null;
    }
  };
}

function canUseViteReloadGuard(): boolean {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") return false;
  const { hostname } = window.location;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".local");
}

function createStateMeshViteReloadSession(): StateMeshViteReloadSession {
  let socket: WebSocket | null = null;
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;
  let hmrSignalUntil = 0;
  let disposed = false;

  const forceReload = () => {
    if (reloadTimer || disposed) return;
    reloadTimer = setTimeout(() => {
      window.location.reload();
    }, 0);
  };

  const markHmrSignal = () => {
    hmrSignalUntil = Date.now() + 3_000;
  };

  const connect = async () => {
    const socketUrl = await resolveViteSocketUrl();
    if (!socketUrl || disposed) return;

    try {
      socket = new WebSocket(socketUrl, "vite-hmr");
      socket.addEventListener("message", (event) => {
        if (shouldReloadForViteMessage(event.data)) {
          markHmrSignal();
          forceReload();
        }
      });
    } catch {
      socket = null;
    }
  };

  const restoreConsole = installViteConsoleReloadBridge((kind) => {
    if (kind === "hmr") markHmrSignal();
    forceReload();
  });
  const removeRuntimeListeners = installViteRuntimeReloadBridge(() => Date.now() <= hmrSignalUntil, forceReload);

  void connect();

  return {
    refs: 0,
    close() {
      disposed = true;
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = null;
      restoreConsole();
      removeRuntimeListeners();
      socket?.close();
      socket = null;
    }
  };
}

function installViteConsoleReloadBridge(onReloadSignal: (kind: "error" | "hmr") => void): () => void {
  if (typeof console === "undefined") return () => undefined;

  const originals: Partial<Record<StateMeshConsoleMethod, (...args: unknown[]) => void>> = {};
  const methods: StateMeshConsoleMethod[] = ["debug", "error", "info", "log", "warn"];

  for (const method of methods) {
    originals[method] = console[method] as (...args: unknown[]) => void;
    console[method] = ((...args: unknown[]) => {
      const kind = getViteConsoleSignal(args);
      if (kind) onReloadSignal(kind);
      originals[method]?.(...args);
    }) as typeof console[typeof method];
  }

  return () => {
    for (const method of methods) {
      const original = originals[method];
      if (original) {
        console[method] = original as typeof console[typeof method];
      }
    }
  };
}

function installViteRuntimeReloadBridge(isInsideHmrSignal: () => boolean, forceReload: () => void): () => void {
  const handleRuntimeError = () => {
    if (isInsideHmrSignal()) forceReload();
  };

  window.addEventListener("error", handleRuntimeError, true);
  window.addEventListener("unhandledrejection", handleRuntimeError, true);

  return () => {
    window.removeEventListener("error", handleRuntimeError, true);
    window.removeEventListener("unhandledrejection", handleRuntimeError, true);
  };
}

async function resolveViteSocketUrl(): Promise<string | null> {
  const clientUrl = findViteClientUrl();
  if (!clientUrl) return null;

  const token = await readViteWebSocketToken(clientUrl);
  const socketUrl = new URL(clientUrl);
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
  socketUrl.pathname = socketUrl.pathname.replace(/@vite\/client$/, "");
  socketUrl.search = token ? `?token=${encodeURIComponent(token)}` : "";
  socketUrl.hash = "";

  return socketUrl.href;
}

function findViteClientUrl(): string | null {
  const scripts = Array.from(document.querySelectorAll("script[src]")) as HTMLScriptElement[];
  const viteClient = scripts.find((script) => script.src.includes("/@vite/client"));
  return viteClient?.src ?? null;
}

async function readViteWebSocketToken(clientUrl: string): Promise<string | null> {
  try {
    const response = await fetch(clientUrl);
    if (!response.ok) return null;

    const source = await response.text();
    return source.match(/const wsToken = ["']([^"']+)["']/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function shouldReloadForViteMessage(data: unknown): boolean {
  if (typeof data !== "string") return false;

  try {
    const payload = JSON.parse(data) as ViteHotPayload;
    return payload.type === "update" || payload.type === "error" || payload.type === "full-reload";
  } catch {
    return false;
  }
}

function getViteConsoleSignal(args: unknown[]): "error" | "hmr" | null {
  const text = args.map(formatConsoleArg).join(" ");
  if (!text.includes("[vite]") && !text.includes("[hmr]")) return null;
  if (text.includes("hot updated:") || text.includes("css hot updated:")) return "hmr";
  if (text.includes("failed to reload") || text.includes("Internal Server Error") || text.includes("error happened")) return "error";
  if (/\b(DuplicateRegistrationError|ReferenceError|SyntaxError|TypeError|not defined)\b/i.test(text)) return "error";
  return null;
}

function formatConsoleArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") {
    return value.message;
  }
  return "";
}
