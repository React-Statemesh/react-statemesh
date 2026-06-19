import React, { Suspense } from "react";
import {
  MeshErrorBoundary,
  StateMeshDevtools,
  StateMeshProvider,
  createMesh,
  useMeshAction,
  useMeshState,
  useSuspenseMeshResource
} from "react-statemesh";

export function createProductionObservabilityExample() {
  const mesh = createMesh({
    name: "production-observability-js",
    state: {
      refreshes: 0
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
      return { id: "user_1", name: "Ada" };
    }
  });

  const recordRefresh = mesh.action("profile.recordRefresh", (state) => {
    state.refreshes += 1;
  });

  return {
    mesh,
    profileResource,
    recordRefresh
  };
}

const example = createProductionObservabilityExample();

function Profile() {
  const profile = useSuspenseMeshResource(example.profileResource);
  const recordRefresh = useMeshAction(example.recordRefresh);
  const [refreshes] = useMeshState("refreshes");

  return (
    <section>
      <h1>{profile.data.name}</h1>
      <p>Refreshes: {refreshes}</p>
      <button type="button" onClick={() => recordRefresh()}>Record refresh</button>
    </section>
  );
}

export default function App() {
  return (
    <StateMeshProvider mesh={example.mesh}>
      <MeshErrorBoundary fallbackRender={({ error, reset }) => (
        <button type="button" onClick={reset}>{error.message}: retry</button>
      )}>
        <Suspense fallback={<p>Loading profile</p>}>
          <Profile />
        </Suspense>
      </MeshErrorBoundary>
      <StateMeshDevtools mesh={example.mesh} showProfiler showDoctor />
    </StateMeshProvider>
  );
}
