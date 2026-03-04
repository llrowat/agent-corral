import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KeyboardShortcuts } from "./KeyboardShortcuts";

describe("KeyboardShortcuts", () => {
  it("is hidden by default", () => {
    const { container } = render(<KeyboardShortcuts />);
    expect(container.querySelector(".shortcuts-overlay")).toBeNull();
  });

  it("opens when ? key is pressed", () => {
    const { container } = render(<KeyboardShortcuts />);
    fireEvent.keyDown(window, { key: "?" });
    expect(container.querySelector(".shortcuts-overlay")).not.toBeNull();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("displays all shortcut entries from SHORTCUT_LIST", () => {
    render(<KeyboardShortcuts />);
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByText("Open search")).toBeInTheDocument();
    expect(screen.getByText("Go to Overview")).toBeInTheDocument();
    expect(screen.getByText("Go to Agents")).toBeInTheDocument();
    expect(screen.getByText("Close modal/search")).toBeInTheDocument();
  });

  it("shows its own shortcut entry for ?", () => {
    render(<KeyboardShortcuts />);
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByText("Show keyboard shortcuts")).toBeInTheDocument();
  });

  it("closes when Escape is pressed", () => {
    const { container } = render(<KeyboardShortcuts />);
    fireEvent.keyDown(window, { key: "?" });
    expect(container.querySelector(".shortcuts-overlay")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".shortcuts-overlay")).toBeNull();
  });

  it("closes when overlay is clicked", () => {
    const { container } = render(<KeyboardShortcuts />);
    fireEvent.keyDown(window, { key: "?" });
    const overlay = container.querySelector(".shortcuts-overlay")!;
    fireEvent.click(overlay);
    expect(container.querySelector(".shortcuts-overlay")).toBeNull();
  });

  it("does not close when modal content is clicked", () => {
    const { container } = render(<KeyboardShortcuts />);
    fireEvent.keyDown(window, { key: "?" });
    const modal = container.querySelector(".shortcuts-modal")!;
    fireEvent.click(modal);
    expect(container.querySelector(".shortcuts-overlay")).not.toBeNull();
  });

  it("opens via custom open-shortcuts event", () => {
    const { container } = render(<KeyboardShortcuts />);
    fireEvent(window, new CustomEvent("open-shortcuts"));
    expect(container.querySelector(".shortcuts-overlay")).not.toBeNull();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("does not open ? shortcut when target is an input", () => {
    const { container } = render(
      <div>
        <input data-testid="text-input" />
        <KeyboardShortcuts />
      </div>
    );
    const input = screen.getByTestId("text-input");
    fireEvent.keyDown(input, { key: "?" });
    expect(container.querySelector(".shortcuts-overlay")).toBeNull();
  });
});
