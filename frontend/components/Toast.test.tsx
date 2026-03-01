import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast";

function TestConsumer() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success("Done!")}>Success</button>
      <button onClick={() => toast.error("Oops", "detail info")}>Error</button>
      <button onClick={() => toast.info("FYI")}>Info</button>
      <button onClick={() => toast.warn("Watch out")}>Warn</button>
    </div>
  );
}

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders success toast when triggered", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Success"));
    expect(screen.getByText("Done!")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveClass("toast-success");
  });

  it("renders error toast with detail toggle", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Error"));
    expect(screen.getByText("Oops")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();

    // Click Details to expand
    fireEvent.click(screen.getByText("Details"));
    expect(screen.getByText("detail info")).toBeInTheDocument();
    expect(screen.getByText("Hide")).toBeInTheDocument();
  });

  it("auto-dismisses success toast after duration", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Success"));
    expect(screen.getByText("Done!")).toBeInTheDocument();

    // Fast-forward past the auto-dismiss duration (4s for non-error)
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("Done!")).not.toBeInTheDocument();
  });

  it("manually dismisses toast when X is clicked", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Info"));
    expect(screen.getByText("FYI")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText("FYI")).not.toBeInTheDocument();
  });

  it("throws when useToast is used outside provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      "useToast must be used within ToastProvider"
    );
    spy.mockRestore();
  });

  it("renders multiple toasts simultaneously", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Success"));
    fireEvent.click(screen.getByText("Warn"));
    const toasts = screen.getAllByRole("alert");
    expect(toasts.length).toBe(2);
  });
});
