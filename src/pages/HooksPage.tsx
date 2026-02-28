import { useEffect, useState, useCallback } from "react";
import type { Repo, HookEvent, HookGroup, HookHandler } from "@/types";
import { HOOK_EVENTS } from "@/types";
import * as api from "@/lib/tauri";

interface Props {
  repo: Repo | null;
}

function newHandler(): HookHandler {
  return { hookType: "command", command: "", prompt: null, timeout: null };
}

function newGroup(): HookGroup {
  return { matcher: null, hooks: [newHandler()] };
}

export function HooksPage({ repo }: Props) {
  const [hooks, setHooks] = useState<HookEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [editing, setEditing] = useState<HookEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(false);

  const loadHooks = useCallback(async () => {
    if (!repo) return;
    try {
      const result = await api.readHooks(repo.path);
      setHooks(result);
    } catch {
      setHooks([]);
    }
  }, [repo]);

  useEffect(() => {
    setSelectedEvent(null);
    setEditing(null);
    loadHooks();
  }, [loadHooks, repo]);

  if (!repo) {
    return (
      <div className="page page-empty">
        <p>Select a repository to manage hooks.</p>
      </div>
    );
  }

  const selected = hooks.find((h) => h.event === selectedEvent) ?? null;
  const currentEvent = editing ?? selected;

  const handleSave = async () => {
    if (!editing || !repo) return;
    setSaving(true);
    try {
      // Replace or add this event in the hooks array
      const updated = hooks.filter((h) => h.event !== editing.event);
      // Only add if there are groups with hooks
      if (editing.groups.length > 0) {
        updated.push(editing);
      }
      await api.writeHooks(repo.path, updated);
      await loadHooks();
      setSelectedEvent(editing.event);
      setEditing(null);
      setIsNew(false);
    } catch (e) {
      alert(`Failed to save hooks: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (eventName: string) => {
    if (!repo) return;
    if (!confirm(`Remove all hooks for "${eventName}"?`)) return;
    try {
      const updated = hooks.filter((h) => h.event !== eventName);
      await api.writeHooks(repo.path, updated);
      await loadHooks();
      if (selectedEvent === eventName) setSelectedEvent(null);
      if (editing?.event === eventName) setEditing(null);
    } catch (e) {
      alert(`Failed to delete hooks: ${e}`);
    }
  };

  const startNew = () => {
    // Find first unused event
    const usedEvents = hooks.map((h) => h.event);
    const available = HOOK_EVENTS.find((e) => !usedEvents.includes(e));
    setEditing({
      event: available ?? HOOK_EVENTS[0],
      groups: [newGroup()],
    });
    setSelectedEvent(null);
    setIsNew(true);
  };

  const updateGroup = (groupIdx: number, updater: (g: HookGroup) => HookGroup) => {
    if (!editing) return;
    const groups = editing.groups.map((g, i) => (i === groupIdx ? updater(g) : g));
    setEditing({ ...editing, groups });
  };

  const updateHandler = (
    groupIdx: number,
    hookIdx: number,
    updater: (h: HookHandler) => HookHandler
  ) => {
    updateGroup(groupIdx, (g) => ({
      ...g,
      hooks: g.hooks.map((h, i) => (i === hookIdx ? updater(h) : h)),
    }));
  };

  const addGroup = () => {
    if (!editing) return;
    setEditing({ ...editing, groups: [...editing.groups, newGroup()] });
  };

  const removeGroup = (idx: number) => {
    if (!editing) return;
    setEditing({ ...editing, groups: editing.groups.filter((_, i) => i !== idx) });
  };

  const addHandler = (groupIdx: number) => {
    updateGroup(groupIdx, (g) => ({ ...g, hooks: [...g.hooks, newHandler()] }));
  };

  const removeHandler = (groupIdx: number, hookIdx: number) => {
    updateGroup(groupIdx, (g) => ({
      ...g,
      hooks: g.hooks.filter((_, i) => i !== hookIdx),
    }));
  };

  return (
    <div className="page hooks-page">
      <div className="split-layout">
        <div className="panel-left">
          <div className="panel-header">
            <h3>Hooks</h3>
            <button className="btn btn-sm" onClick={startNew}>
              + New
            </button>
          </div>
          <ul className="agent-list">
            {hooks.map((hookEvent) => (
              <li
                key={hookEvent.event}
                className={`agent-list-item ${
                  currentEvent?.event === hookEvent.event ? "active" : ""
                }`}
              >
                <button
                  className="agent-select"
                  onClick={() => {
                    setSelectedEvent(hookEvent.event);
                    setEditing(null);
                    setIsNew(false);
                  }}
                >
                  <span className="agent-name">{hookEvent.event}</span>
                  <span className="agent-id">
                    {hookEvent.groups.length} group(s),{" "}
                    {hookEvent.groups.reduce((sum, g) => sum + g.hooks.length, 0)} handler(s)
                  </span>
                </button>
                <button
                  className="btn-icon"
                  onClick={() => handleDelete(hookEvent.event)}
                  title="Remove"
                >
                  x
                </button>
              </li>
            ))}
            {hooks.length === 0 && (
              <li className="text-muted" style={{ padding: "12px" }}>
                No hooks configured
              </li>
            )}
          </ul>
        </div>

        <div className="panel-right">
          {!currentEvent ? (
            <div className="panel-empty">
              <p>Select a hook event or create a new one.</p>
            </div>
          ) : editing ? (
            <div className="agent-editor">
              <h3>{isNew ? "New Hook Event" : `Edit: ${editing.event}`}</h3>

              <div className="form-group">
                <label>Event Type</label>
                <select
                  value={editing.event}
                  onChange={(e) => setEditing({ ...editing, event: e.target.value })}
                  disabled={!isNew}
                >
                  {HOOK_EVENTS.map((evt) => (
                    <option key={evt} value={evt}>
                      {evt}
                    </option>
                  ))}
                </select>
              </div>

              {editing.groups.map((group, gi) => (
                <div key={gi} className="hook-group">
                  <div className="hook-group-header">
                    <h4>Group {gi + 1}</h4>
                    {editing.groups.length > 1 && (
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => removeGroup(gi)}
                      >
                        Remove Group
                      </button>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Matcher (regex, optional)</label>
                    <input
                      type="text"
                      value={group.matcher ?? ""}
                      onChange={(e) =>
                        updateGroup(gi, (g) => ({
                          ...g,
                          matcher: e.target.value || null,
                        }))
                      }
                      placeholder="e.g. Bash|Write"
                    />
                  </div>

                  {group.hooks.map((handler, hi) => (
                    <div key={hi} className="hook-handler">
                      <div className="hook-handler-header">
                        <span className="text-muted">Handler {hi + 1}</span>
                        {group.hooks.length > 1 && (
                          <button
                            className="btn-icon"
                            onClick={() => removeHandler(gi, hi)}
                            title="Remove handler"
                          >
                            x
                          </button>
                        )}
                      </div>

                      <div className="form-group">
                        <label>Type</label>
                        <select
                          value={handler.hookType}
                          onChange={(e) =>
                            updateHandler(gi, hi, (h) => ({
                              ...h,
                              hookType: e.target.value,
                            }))
                          }
                        >
                          <option value="command">Command</option>
                          <option value="prompt">Prompt</option>
                        </select>
                      </div>

                      {handler.hookType === "command" && (
                        <div className="form-group">
                          <label>Command</label>
                          <textarea
                            rows={2}
                            value={handler.command ?? ""}
                            onChange={(e) =>
                              updateHandler(gi, hi, (h) => ({
                                ...h,
                                command: e.target.value || null,
                              }))
                            }
                            placeholder="echo 'hook fired'"
                          />
                        </div>
                      )}

                      {handler.hookType === "prompt" && (
                        <div className="form-group">
                          <label>Prompt</label>
                          <textarea
                            rows={3}
                            value={handler.prompt ?? ""}
                            onChange={(e) =>
                              updateHandler(gi, hi, (h) => ({
                                ...h,
                                prompt: e.target.value || null,
                              }))
                            }
                            placeholder="Review the changes before proceeding..."
                          />
                        </div>
                      )}

                      <div className="form-group">
                        <label>Timeout (ms, optional)</label>
                        <input
                          type="text"
                          value={handler.timeout ?? ""}
                          onChange={(e) =>
                            updateHandler(gi, hi, (h) => ({
                              ...h,
                              timeout: e.target.value
                                ? parseInt(e.target.value, 10) || null
                                : null,
                            }))
                          }
                          placeholder="Default"
                        />
                      </div>
                    </div>
                  ))}

                  <button className="btn btn-sm" onClick={() => addHandler(gi)}>
                    + Add Handler
                  </button>
                </div>
              ))}

              <button
                className="btn btn-sm"
                onClick={addGroup}
                style={{ marginTop: "12px" }}
              >
                + Add Group
              </button>

              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Hooks"}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setEditing(null);
                    setIsNew(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="agent-detail">
              <h3>{selected!.event}</h3>
              {selected!.groups.map((group, gi) => (
                <div key={gi} className="hook-group-detail">
                  <h4>Group {gi + 1}</h4>
                  {group.matcher && (
                    <div className="detail-field">
                      <label>Matcher</label>
                      <code>{group.matcher}</code>
                    </div>
                  )}
                  {group.hooks.map((handler, hi) => (
                    <div key={hi} className="hook-handler-detail">
                      <div className="detail-field">
                        <label>Type</label>
                        <span className="tool-tag">{handler.hookType}</span>
                      </div>
                      {handler.command && (
                        <div className="detail-field">
                          <label>Command</label>
                          <pre className="prompt-preview">{handler.command}</pre>
                        </div>
                      )}
                      {handler.prompt && (
                        <div className="detail-field">
                          <label>Prompt</label>
                          <pre className="prompt-preview">{handler.prompt}</pre>
                        </div>
                      )}
                      {handler.timeout && (
                        <div className="detail-field">
                          <label>Timeout</label>
                          <code>{handler.timeout}ms</code>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              <div className="form-actions">
                <button
                  className="btn"
                  onClick={() => setEditing({ ...selected! })}
                >
                  Edit
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
