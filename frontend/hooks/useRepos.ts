import { useState, useEffect, useCallback } from "react";
import type { Repo, RepoStatus } from "@/types";
import * as api from "@/lib/tauri";

export function useRepos() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.listRepos();
      setRepos(result);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addRepo = useCallback(
    async (path: string) => {
      const repo = await api.addRepo(path);
      await refresh();
      return repo;
    },
    [refresh]
  );

  const removeRepo = useCallback(
    async (repoId: string) => {
      await api.removeRepo(repoId);
      await refresh();
    },
    [refresh]
  );

  const getStatus = useCallback(
    async (path: string): Promise<RepoStatus> => {
      return api.getRepoStatus(path);
    },
    []
  );

  return { repos, loading, error, addRepo, removeRepo, getStatus, refresh };
}
