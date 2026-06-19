import {
  Component,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode
} from "react";

/** Props passed to a StateMesh error fallback renderer. */
export type MeshErrorFallbackProps = {
  /** Error caught by the boundary. */
  error: Error;
  /** Reset the boundary and allow suspended resources to retry. */
  reset: () => void;
};

/** Props for `MeshErrorBoundary`. */
export type MeshErrorBoundaryProps = {
  /** React subtree protected by the boundary. */
  children: ReactNode;
  /** Static fallback content. */
  fallback?: ReactNode;
  /** Render function that receives the error and reset callback. */
  fallbackRender?: (props: MeshErrorFallbackProps) => ReactNode;
  /** Called after an error is caught. */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Called when the boundary is reset. */
  onReset?: () => void;
  /** Changing any reset key clears the current error. */
  resetKeys?: readonly unknown[];
};

/** Value exposed by `MeshErrorResetBoundary`. */
export type MeshErrorResetBoundaryValue = {
  /** Reset nested StateMesh error boundaries. */
  reset: () => void;
};

/** Props for `MeshErrorResetBoundary`. */
export type MeshErrorResetBoundaryProps = {
  /** React subtree or render function that receives a shared reset callback. */
  children: ReactNode | ((value: MeshErrorResetBoundaryValue) => ReactNode);
};

type ErrorResetContextValue = {
  reset: () => void;
  isReset: () => boolean;
  clearReset: () => void;
  resetCount: number;
};

const defaultResetContext: ErrorResetContextValue = {
  reset: () => undefined,
  isReset: () => false,
  clearReset: () => undefined,
  resetCount: 0
};

const MeshErrorResetContext = createContext<ErrorResetContextValue>(defaultResetContext);

type InternalBoundaryProps = MeshErrorBoundaryProps & {
  requestReset: () => void;
  resetSignal: string;
};

type InternalBoundaryState = {
  error: Error | null;
};

class InternalMeshErrorBoundary extends Component<InternalBoundaryProps, InternalBoundaryState> {
  override state: InternalBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error): InternalBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  override componentDidUpdate(previousProps: InternalBoundaryProps): void {
    const resetKeysChanged = !arrayShallowEqual(previousProps.resetKeys ?? [], this.props.resetKeys ?? []);
    if (this.state.error && (previousProps.resetSignal !== this.props.resetSignal || resetKeysChanged)) {
      this.setState({ error: null });
    }
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallbackRender) {
      return this.props.fallbackRender({
        error,
        reset: this.props.requestReset
      });
    }

    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <div role="alert">
        <p>{error.message}</p>
        <button type="button" onClick={this.props.requestReset}>Retry</button>
      </div>
    );
  }
}

/**
 * Catch render and Suspense-resource errors from a React subtree.
 *
 * Calling the fallback `reset` callback also marks failed StateMesh resources for a forced retry.
 */
export function MeshErrorBoundary({
  children,
  fallback,
  fallbackRender,
  onError,
  onReset,
  resetKeys
}: MeshErrorBoundaryProps) {
  const parent = useContext(MeshErrorResetContext);
  const resetRequested = useRef(false);
  const [localResetCount, setLocalResetCount] = useState(0);

  const reset = useCallback(() => {
    resetRequested.current = true;
    setLocalResetCount((current) => current + 1);
    parent.reset();
    onReset?.();
  }, [parent, onReset]);

  const context = useMemo<ErrorResetContextValue>(() => ({
    reset,
    isReset: () => resetRequested.current || parent.isReset(),
    clearReset: () => {
      resetRequested.current = false;
      parent.clearReset();
    },
    resetCount: localResetCount + parent.resetCount
  }), [reset, localResetCount, parent]);

  return (
    <MeshErrorResetContext.Provider value={context}>
      <InternalMeshErrorBoundary
        fallback={fallback}
        fallbackRender={fallbackRender}
        onError={onError}
        resetKeys={resetKeys}
        requestReset={reset}
        resetSignal={`${parent.resetCount}:${localResetCount}`}
      >
        {children}
      </InternalMeshErrorBoundary>
    </MeshErrorResetContext.Provider>
  );
}

/** Share one reset command across multiple nested StateMesh error boundaries. */
export function MeshErrorResetBoundary({ children }: MeshErrorResetBoundaryProps) {
  const resetRequested = useRef(false);
  const [resetCount, setResetCount] = useState(0);
  const reset = useCallback(() => {
    resetRequested.current = true;
    setResetCount((current) => current + 1);
  }, []);
  const context = useMemo<ErrorResetContextValue>(() => ({
    reset,
    isReset: () => resetRequested.current,
    clearReset: () => {
      resetRequested.current = false;
    },
    resetCount
  }), [reset, resetCount]);

  return (
    <MeshErrorResetContext.Provider value={context}>
      {typeof children === "function" ? children({ reset }) : children}
    </MeshErrorResetContext.Provider>
  );
}

/** Access the nearest shared StateMesh error reset command. */
export function useMeshErrorResetBoundary(): MeshErrorResetBoundaryValue {
  const context = useContext(MeshErrorResetContext);
  return { reset: context.reset };
}

/** Internal reset state used by Suspense-aware StateMesh hooks. */
export function useMeshErrorResetState(): Pick<ErrorResetContextValue, "isReset" | "clearReset"> {
  const context = useContext(MeshErrorResetContext);
  return {
    isReset: context.isReset,
    clearReset: context.clearReset
  };
}

function arrayShallowEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}
