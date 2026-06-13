"use client";

import { useMeshState } from "react-statemesh";

export default function Page() {
  const [theme, setTheme] = useMeshState("theme");

  return (
    <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
      Current theme: {theme}
    </button>
  );
}
