"use client";

import { useMeshState } from "statemesh-core";

export default function Page() {
  const [theme, setTheme] = useMeshState<"light" | "dark">("theme");

  return (
    <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
      Current theme: {theme}
    </button>
  );
}
