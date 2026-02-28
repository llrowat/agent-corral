import { useState, useEffect, useCallback } from "react";
import type { SessionEnvelope } from "@/types";
import * as api from "@/lib/tauri";

export function useSessions() {
  const [sessions, setSessions] = useState<SessionEnvelope[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.listSessions();
      setSessions(result);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  const launchSession = useCallback(
    async (
      repoPath: string,
      commandName: string,
      command: string,
      useWorktree?: boolean,
      baseBranch?: string | null
    ) => {
      const sessionId = await api.launchSession(
        repoPath,
        commandName,
        command,
        useWorktree,
        baseBranch
      );
      await refresh();
      return sessionId;
    },
    [refresh]
  );

  return { sessions, loading, error, launchSession, refresh };
}
