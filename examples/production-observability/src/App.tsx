import { Suspense } from "react";
import {
  MeshComponent,
  MeshErrorBoundary,
  StateMeshProvider,
  createMesh,
  createSelector,
  useMeshAction,
  useMeshSelector,
  useMeshState,
  useSuspenseMeshResource
} from "statemesh-core";
import { StateMeshDevtools } from "statemesh-core/devtools";

type User = {
  id: string;
  name: string;
};

// Memoized selector — only recomputes when `refreshes` changes, skipping
// unnecessary re-renders even when other parts of state update frequently.
const selectRefreshesParity = createSelector<{ refreshes: number }, [number], string>(
  [(state) => state.refreshes],
  (refreshes) => (refreshes % 2 === 0 ? "even" : "odd")
);

export function createProductionObservabilityExample() {
  const mesh = createMesh({
    name: "production-observability",
    state: {
      refreshes: 0,
      cacheHits: 0,
      cacheMisses: 0
    },
    profiler: {
      limit: 200,
      slowThreshold: 16
    }
  });

  const profileResource = mesh.resource("profile.current", {
    staleTime: "5m",
    tags: [{ type: "profile" }],
    async fetch() {
      return { id: "user_1", name: "Ada" } satisfies User;
    }
  });

  const recordRefresh = mesh.action("profile.recordRefresh", (state) => {
    state.refreshes += 1;
  });

  // Batch action: multiple state mutations trigger a single notification,
  // one `state.changed` event, and one DevTools snapshot.
  const recordCacheHit = mesh.action("cache.recordHit", (state) => {
    state.cacheHits += 1;
    state.cacheMisses = 0;
    mesh.batch(() => {
      // In a real app other hops (metrics push, log write) go here.
    });
  });

  return {
    mesh,
    profileResource,
    recordRefresh,
    recordCacheHit
  };
}

const example = createProductionObservabilityExample();

function Profile() {
  const profile = useSuspenseMeshResource(example.profileResource);
  const recordRefresh = useMeshAction(example.recordRefresh);
  const recordCacheHit = useMeshAction(example.recordCacheHit);
  const [refreshes] = useMeshState<number>("refreshes");
  const parity = useMeshSelector(selectRefreshesParity);

  return (
    <section>
      <h1>{profile.data.name}</h1>
      <p>Refreshes: {refreshes} ({parity})</p>
      <button type="button" onClick={() => recordRefresh()}>Record refresh</button>
      <button type="button" onClick={() => recordCacheHit()}>Batch update</button>
    </section>
  );
}

export default function App() {
  return (
    <StateMeshProvider mesh={example.mesh}>
      <MeshComponent name="ProfileScreen">
        <MeshErrorBoundary fallbackRender={({ error, reset }) => (
          <button type="button" onClick={reset}>{error.message}: retry</button>
        )}>
          <Suspense fallback={<p>Loading profile</p>}>
            <Profile />
          </Suspense>
        </MeshErrorBoundary>
      </MeshComponent>
      <StateMeshDevtools
        mesh={example.mesh}
        mask={["auth.token"]}
        defaultView="overview"
      />
    </StateMeshProvider>
  );
}
