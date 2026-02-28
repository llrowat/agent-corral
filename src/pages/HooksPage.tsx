import { useEffect, useState, useCallback } from "react";
import type { Scope, HookEvent, HookGroup, HookHandler } from "@/types";
import { HOOK_EVENTS } from "@/types";
import * as api from "@/lib/tauri";
import { CreateWithAiModal } from "@/components/CreateWithAiModal";

interface Props {
  scope: Scope | null;
  homePath: string | null;
}

function newHandler(): HookHandler {
  return { hookType: "command", command: "", prompt: null, timeout: null };
}

function newGroup(): HookGroup {
  return { matcher: null, hooks: [newHandler()] };
}

export function HooksPage({ scope, homePath }: Props) {
  const [hooks, setHooks] = useState<HookEvent[]>([]);
  const [globalHooks, setGlobalHooks] = useState<HookEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [selectedIsGlobal, setSelectedIsGlobal] = useState(false);
  const [editing, setEditing] = useState<HookEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  const basePath = scope?.type === "global" ? scope.homePath : scope?.type === "project" ? scope.repo.path : null;
  const isProjectScope = scope?.type === "project";

  const loadHooks = useCallback(async () => {
    if (!basePath) return;
    try {
      const result = await api.readHooks(basePath);
      setHooks(result);
    } catch {
      setHooks([]);
    }
  }, [basePath]);

  const loadGlobalHooks = useCallback(async () => {
    if (!isProjectScope || !homePath) {
      setGlobalHooks([]);
      return;
    }
    try {
      const result = await api.readHooks(homePath);
      setGlobalHooks(result);
    } catch {
      setGlobalHooks([]);
    }
  }, [isProjectScope, homePath]);

  useEffect(() => {
    setSelectedEvent(null);
    setSelectedIsGlobal(false);
    setEditing(null);
    loadHooks();
    loadGlobalHooks();
  }, [loadHooks, loadGlobalHooks, basePath]);

  if (!scope) {
    return (
      <div className="page page-empty">
        <p>Select a scope to manage hooks.</p>
      </div>
    );
  }

  const selected = selectedIsGlobal
    ? globalHooks.find((h) => h.event === selectedEvent) ?? null
    : hooks.find((h) => h.event === selectedEvent) ?? null;
  const currentEvent = editing ?? selected;

  const handleSave = async () => {
    if (!editing || !basePath) return;
    setSaving(true);
    try {
      const updated = hooks.filter((h) => h.event !== editing.event);
      if (editing.groups.length > 0) {
        updated.push(editing);
      }
      await api.writeHooks(basePath, updated);
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
    if (!basePath) return;
    if (!confirm(`Remove all hooks for "${eventName}"?`)) return;
    try {
      const updated = hooks.filter((h) => h.event !== eventName);
      await api.writeHooks(basePath, updated);
      await loadHooks();
      if (selectedEvent === eventName) setSelectedEvent(null);
      if (editing?.event === eventName) setEditing(null);
    } catch (e) {
      alert(`Failed to delete hooks: ${e}`);
    }
  };

  const startNew = () => {
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
            <div className="header-actions">
              {basePath && (
                <button
                  className="btn btn-sm"
                  onClick={() => setShowAiModal(true)}
                >
                  AI Create
                </button>
              )}
              <button className="btn btn-sm" onClick={startNew}>
                + New
              </button>
            </div>
          </div>
          <ul className="agent-list">
            {hooks.map((hookEvent) => (
              <li
                key={hookEvent.event}
                className={`agent-list-item ${
                  currentEvent?.event === hookEvent.event && !selectedIsGlobal ? "active" : ""
                }`}
              >
                <button
                  className="agent-select"
                  onClick={() => {
                    setSelectedEvent(hookEvent.event);
                    setSelectedIsGlobal(false);
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
            {hooks.length === 0 && !isProjectScope && (
              <li className="text-muted" style={{ padding: "12px" }}>
                No hooks configured
              </li>
            )}
            {isProjectScope && hooks.length === 0 && globalHooks.length === 0 && (
              <li className="text-muted" style={{ padding: "12px" }}>
                No hooks configured
              </li>
            )}
          </ul>
          {isProjectScope && globalHooks.length > 0 && (
            <>
              <div className="global-section-header">
                <span className="global-section-label">Global</span>
              </div>
              <ul className="agent-list">
                {globalHooks.map((hookEvent) => (
                  <li
                    key={`global-${hookEvent.event}`}
                    className={`agent-list-item global-item ${
                      currentEvent?.event === hookEvent.event && selectedIsGlobal ? "active" : ""
                    }`}
                  >
                    <button
                      className="agent-select"
                      onClick={() => {
                        setSelectedEvent(hookEvent.event);
                        setSelectedIsGlobal(true);
                        setEditing(null);
                        setIsNew(false);
                      }}
                    >
                      <span className="agent-name">
                        {hookEvent.event}
                        <span className="badge-global">global</span>
                      </span>
                      <span className="agent-id">
                        {hookEvent.groups.length} group(s),{" "}
                        {hookEvent.groups.reduce((sum, g) => sum + g.hooks.length, 0)} handler(s)
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
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
              <h3>
                {selected!.event}
                {selectedIsGlobal && <span className="badge-global" style={{ marginLeft: 8 }}>global</span>}
              </h3>
              {selectedIsGlobal && (
                <p className="global-readonly-hint">
                  This hook is defined in the global scope. Switch to Global Settings to edit it.
                </p>
              )}
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
              {!selectedIsGlobal && (
                <div className="form-actions">
                  <button
                    className="btn"
                    onClick={() => setEditing({ ...selected! })}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {showAiModal && basePath && (
        <CreateWithAiModal
          entityType="hook"
          repoPath={basePath}
          onClose={() => setShowAiModal(false)}
          onCreated={() => loadHooks()}
        />
      )}
    </div>
  );
}
