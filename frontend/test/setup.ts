import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock @tauri-apps/api/core since we're not in a Tauri runtime during tests
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Mock @tauri-apps/plugin-dialog since we're not in a Tauri runtime during tests
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));
