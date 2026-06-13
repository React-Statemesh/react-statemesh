import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMesh, ProviderError, StateMeshProvider, useMeshSelector, useMeshState } from "../../src";

describe("React hooks", () => {
  it("throws ProviderError outside the provider", () => {
    function Broken() {
      useMeshSelector("theme");
      return null;
    }

    expect(() => render(<Broken />)).toThrow(ProviderError);
  });

  it("subscribes to selected state through the provider", () => {
    const mesh = createMesh({
      state: {
        theme: "light" as "light" | "dark"
      }
    });

    function ThemeToggle() {
      const [theme, setTheme] = useMeshState<"light" | "dark">("theme");
      return <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme}</button>;
    }

    render(
      <StateMeshProvider mesh={mesh}>
        <ThemeToggle />
      </StateMeshProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "light" }));
    expect(screen.getByRole("button", { name: "dark" })).toBeTruthy();
  });
});
