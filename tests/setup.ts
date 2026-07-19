import { vi } from "vitest";

// React 19 removed react-dom/test-utils. @testing-library/react@16 still imports from it.
// With NODE_ENV=development, React exports act. We mock the missing module to use it.
vi.mock("react-dom/test-utils", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const act = (React as any).act ?? ((cb: () => any) => {
    const result = cb();
    return { then: (onF: any, onR: any) => Promise.resolve(result).then(onF, onR) };
  });
  return { act };
});
