import { useState, useEffect, useCallback, useRef } from "react";
import type { PluginSyncStatus } from "@/types";
import * as api from "@/lib/tauri";

/**
 * Polls import sync status for a given repo and manages auto-sync lifecycle.
 * Runs periodic checks based on the configured interval.
 */
export function usePluginSync(repoPath: string | null) {
  const [syncStatuses, setSyncStatuses] = useState<PluginSyncStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!repoPath) {
      setSyncStatuses([]);
      return;
    }
    try {
      setLoading(true);
      const statuses = await api.getImportSyncStatus(repoPath);
      setSyncStatuses(statuses);
      setLastChecked(new Date());
    } catch {
      // Sync is best-effort
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  // Initial load and periodic refresh
  useEffect(() => {
    refresh();

    // Set up periodic check (default 30s for UI refresh; actual git checks
    // are throttled by the backend's sync interval preference)
    intervalRef.current = setInterval(refresh, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  const syncPlugin = useCallback(
    async (pluginName: string) => {
      if (!repoPath) return;
      const result = await api.syncImportedPlugin(repoPath, pluginName);
      await refresh();
      return result;
    },
    [repoPath, refresh]
  );

  const autoSyncAll = useCallback(async () => {
    if (!repoPath) return [];
    const synced = await api.autoSyncRepo(repoPath);
    await refresh();
    return synced;
  }, [repoPath, refresh]);

  const setPinned = useCallback(
    async (pluginName: string, pinned: boolean) => {
      if (!repoPath) return;
      await api.setImportPinned(repoPath, pluginName, pinned);
      await refresh();
    },
    [repoPath, refresh]
  );

  const setAutoSync = useCallback(
    async (pluginName: string, autoSync: boolean) => {
      if (!repoPath) return;
      await api.setImportAutoSync(repoPath, pluginName, autoSync);
      await refresh();
    },
    [repoPath, refresh]
  );

  const unlinkImport = useCallback(
    async (pluginName: string) => {
      if (!repoPath) return;
      await api.removeImportRecord(repoPath, pluginName);
      await refresh();
    },
    [repoPath, refresh]
  );

  const updatesAvailable = syncStatuses.filter(
    (s) => s.updateAvailable && !s.pinned
  ).length;

  return {
    syncStatuses,
    loading,
    lastChecked,
    updatesAvailable,
    refresh,
    syncPlugin,
    autoSyncAll,
    setPinned,
    setAutoSync,
    unlinkImport,
  };
}
