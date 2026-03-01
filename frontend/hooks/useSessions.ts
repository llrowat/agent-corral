import { useState, useEffect, useCallback } from "react";
import type { SessionEnvelope, SessionActivityMap, WorktreeStatus } from "@/types";
import * as api from "@/lib/tauri";

/** Diff stats for a worktree session. */
export type DiffStats = Pick<WorktreeStatus, "insertions" | "deletions">;

export function useSessions() {
  const [sessions, setSessions] = useState<SessionEnvelope[]>([]);
  const [activities, setActivities] = useState<SessionActivityMap>({});
  const [diffStats, setDiffStats] = useState<Record<string, DiffStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [sessionList, activityMap] = await Promise.all([
        api.listSessions(),
        api.pollSessionStates(),
      ]);
      setSessions(sessionList);
      setActivities(activityMap);
      setError(null);

      // Fetch diff stats for worktree sessions
      const wtSessions = sessionList.filter((s) => s.worktreePath);
      if (wtSessions.length > 0) {
        const statsEntries = await Promise.all(
          wtSessions.map(async (s) => {
            try {
              const status = await api.getWorktreeStatus(s.sessionId);
              return [s.sessionId, { insertions: status.insertions, deletions: status.deletions }] as const;
            } catch {
              return null;
            }
          })
        );
        const statsMap: Record<string, DiffStats> = {};
        for (const entry of statsEntries) {
          if (entry) statsMap[entry[0]] = entry[1];
        }
        setDiffStats(statsMap);
      } else {
        setDiffStats({});
      }
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

  return { sessions, activities, diffStats, loading, error, launchSession, refresh };
}
