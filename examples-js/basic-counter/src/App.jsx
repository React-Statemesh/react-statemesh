import { StateMeshProvider, createMesh, useMeshAction, useMeshState } from "react-statemesh";

const mesh = createMesh({
  name: "basic-counter-js",
  state: {
    count: 0
  }
});

const incrementAction = mesh.action("counter.increment", (state, amount = 1) => {
  state.count += amount;
});

function Counter() {
  const [count, setCount] = useMeshState("count");
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
