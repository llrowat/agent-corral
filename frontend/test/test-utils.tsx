import { render, type RenderOptions } from "@testing-library/react";
import { ToastProvider } from "@/components/Toast";
import type { ReactElement } from "react";

/**
 * Wraps the component under test with all required providers (ToastProvider, etc.)
 */
function AllProviders({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

/**
 * Custom render that wraps in providers. Use this instead of @testing-library/react render
 * for any component that uses useToast() or other context hooks.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  return render(ui, { wrapper: AllProviders, ...options });
}
