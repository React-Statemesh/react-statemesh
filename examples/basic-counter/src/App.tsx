import { StateMeshProvider, createMesh, useMeshAction, useMeshState } from "@statemesh/react";

const mesh = createMesh({
  name: "basic-counter",
  state: {
    count: 0
  }
});

const incrementAction = mesh.action("counter.increment", (state, amount: number = 1) => {
  state.count += amount;
});

function Counter() {
  const [count, setCount] = useMeshState<number>("count");
  const increment = useMeshAction(incrementAction);

  return (
    <main>
      <strong>{count}</strong>
      <button onClick={() => setCount((value) => value - 1)}>Decrease</button>
      <button onClick={() => increment(1)}>Increase</button>
    </main>
  );
}

export default function App() {
  return (
    <StateMeshProvider mesh={mesh}>
      <Counter />
    </StateMeshProvider>
  );
}
