import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { usePluginSync } from "./usePluginSync";

const mockInvoke = invoke as ReturnType<typeof vi.fn>;

describe("usePluginSync", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue([]);
  });

  it("returns empty state when repoPath is null", async () => {
    const { result } = renderHook(() => usePluginSync(null));

    await waitFor(() => {
      expect(result.current.syncStatuses).toEqual([]);
      expect(result.current.updatesAvailable).toBe(0);
    });
    // Should not have called any invoke when repoPath is null
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches sync statuses on mount", async () => {
    const mockStatuses = [
      {
        pluginName: "test-plugin",
        pluginDir: "/path/to/plugin",
        pluginExists: true,
        importedCommit: "abc1234",
        libraryCommit: "def5678",
        updateAvailable: true,
        autoSync: true,
        pinned: false,
      },
    ];

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_import_sync_status") return Promise.resolve(mockStatuses);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => usePluginSync("/test/repo"));

    await waitFor(() => {
      expect(result.current.syncStatuses).toHaveLength(1);
    });

    expect(result.current.syncStatuses[0].pluginName).toBe("test-plugin");
    expect(result.current.updatesAvailable).toBe(1);
  });

  it("excludes pinned plugins from updatesAvailable count", async () => {
    const mockStatuses = [
      {
        pluginName: "pinned-plugin",
        pluginDir: "/path/to/plugin",
        pluginExists: true,
        importedCommit: "abc",
        libraryCommit: "def",
        updateAvailable: true,
        autoSync: true,
        pinned: true,
      },
    ];

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_import_sync_status") return Promise.resolve(mockStatuses);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => usePluginSync("/test/repo"));

    await waitFor(() => {
      expect(result.current.syncStatuses).toHaveLength(1);
    });

    expect(result.current.updatesAvailable).toBe(0);
  });

  it("syncPlugin calls backend and refreshes", async () => {
    const mockStatus = {
      pluginName: "test-plugin",
      pluginDir: "/path/to/plugin",
      pluginExists: true,
      importedCommit: "new-commit",
      libraryCommit: "new-commit",
      updateAvailable: false,
      autoSync: true,
      pinned: false,
    };

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_import_sync_status") return Promise.resolve([mockStatus]);
      if (cmd === "sync_imported_plugin") return Promise.resolve(mockStatus);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => usePluginSync("/test/repo"));

    await waitFor(() => {
      expect(result.current.syncStatuses).toHaveLength(1);
    });

    await act(async () => {
      await result.current.syncPlugin("test-plugin");
    });

    expect(mockInvoke).toHaveBeenCalledWith("sync_imported_plugin", {
      repoPath: "/test/repo",
      pluginName: "test-plugin",
    });
  });

  it("setPinned calls backend with correct args", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "set_import_pinned") return Promise.resolve(undefined);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => usePluginSync("/test/repo"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.setPinned("my-plugin", true);
    });

    expect(mockInvoke).toHaveBeenCalledWith("set_import_pinned", {
      repoPath: "/test/repo",
      pluginName: "my-plugin",
      pinned: true,
    });
  });

  it("setAutoSync calls backend with correct args", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "set_import_auto_sync") return Promise.resolve(undefined);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => usePluginSync("/test/repo"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.setAutoSync("my-plugin", false);
    });

    expect(mockInvoke).toHaveBeenCalledWith("set_import_auto_sync", {
      repoPath: "/test/repo",
      pluginName: "my-plugin",
      autoSync: false,
    });
  });

  it("unlinkImport calls backend with correct args", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "remove_import_record") return Promise.resolve(undefined);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => usePluginSync("/test/repo"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.unlinkImport("my-plugin");
    });

    expect(mockInvoke).toHaveBeenCalledWith("remove_import_record", {
      repoPath: "/test/repo",
      pluginName: "my-plugin",
    });
  });

  it("autoSyncAll calls backend and returns synced plugins", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "auto_sync_repo") return Promise.resolve(["plugin-a", "plugin-b"]);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => usePluginSync("/test/repo"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let synced: string[] = [];
    await act(async () => {
      synced = (await result.current.autoSyncAll()) ?? [];
    });

    expect(synced).toEqual(["plugin-a", "plugin-b"]);
    expect(mockInvoke).toHaveBeenCalledWith("auto_sync_repo", {
      repoPath: "/test/repo",
    });
  });
});
