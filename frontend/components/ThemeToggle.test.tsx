import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  it("renders toggle button", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    const btn = screen.getByTitle(/switch to/i);
    expect(btn).toBeInTheDocument();
  });

  it("toggles theme on click", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    const btn = screen.getByTitle(/switch to/i);
    const initialTitle = btn.title;
    fireEvent.click(btn);
    expect(btn.title).not.toBe(initialTitle);
  });

  it("persists theme preference to localStorage", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByTitle(/switch to/i));
    expect(setItemSpy).toHaveBeenCalledWith("agentcorral-theme", expect.any(String));
    setItemSpy.mockRestore();
  });
});
