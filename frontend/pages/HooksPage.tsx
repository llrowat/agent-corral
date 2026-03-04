import { useEffect, useState, useCallback, useRef } from "react";
import type { Scope, HookEvent, HookGroup, HookHandler } from "@/types";
import { HOOK_EVENTS } from "@/types";
import * as api from "@/lib/tauri";
import { PresetPicker } from "@/components/PresetPicker";
import { CreateWithAiModal } from "@/components/CreateWithAiModal";
import { HOOK_PRESETS, type HookPreset } from "@/lib/presets";
import { ScopeBanner } from "@/components/ScopeGuard";
import { DocsLink } from "@/components/DocsLink";
import { useToast } from "@/components/Toast";

interface Props {
  scope: Scope | null;
  homePath: string | null;
}

function newHandler(): HookHandler {
  return { hookType: "command", command: "", prompt: null, timeout: null, async: null, statusMessage: null, model: null };
}

function newGroup(): HookGroup {
  return { matcher: null, hooks: [newHandler()] };
}

export function HooksPage({ scope, homePath }: Props) {
  const toast = useToast();
  const [hooks, setHooks] = useState<HookEvent[]>([]);
  const [globalHooks, setGlobalHooks] = useState<HookEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [selectedIsGlobal, setSelectedIsGlobal] = useState(false);
  const [editing, setEditing] = useState<HookEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  // Drag-and-drop state for reordering hook groups
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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
      toast.error("Failed to save hooks", String(e));
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
      toast.error("Failed to delete hooks", String(e));
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

  const handleSelectPreset = (preset: HookPreset) => {
    setEditing({ ...preset.hookEvent });
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

  // -- Drag & drop handlers for hook group reordering --

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = "move";
    // Add dragging class after a tick so the browser captures the element first
    const target = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => target.classList.add("dragging"));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove("dragging");
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  const handleDropOnEditor = (_e: React.DragEvent, dropIndex: number) => {
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex || !editing) return;
    const reordered = [...editing.groups];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    setEditing({ ...editing, groups: reordered });
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  const handleDropOnDetail = async (_e: React.DragEvent, dropIndex: number) => {
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex || !selected || !basePath || selectedIsGlobal) return;
    // Build new_order: an array of original indices in the new order
    const indices = selected.groups.map((_, i) => i);
    const [moved] = indices.splice(dragIndex, 1);
    indices.splice(dropIndex, 0, moved);
    try {
      await api.reorderHookGroups(basePath, selected.event, indices);
      await loadHooks();
    } catch (e) {
      toast.error("Failed to reorder hook groups", String(e));
    }
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  const handleToggleGroupEnabled = async (event: string, groupIndex: number, currentlyDisabled: boolean) => {
    if (!basePath) return;
    try {
      await api.toggleHookGroupEnabled(basePath, event, groupIndex, currentlyDisabled);
      await loadHooks();
    } catch (e) {
      toast.error("Failed to toggle hook group", String(e));
    }
  };

  return (
    <div className="page hooks-page">
      {scope && <ScopeBanner scope={scope} />}
      <p className="page-description">Shell commands that run automatically in response to Claude Code events. Use hooks to enforce linting, run tests, send notifications, or guard against unwanted changes.</p>
      <div className="split-layout">
        <div className="panel-left">
          <div className="panel-header">
            <h3>Hooks <DocsLink page="hooks" /></h3>
            <div className="header-actions">
              <button
                className="btn btn-sm"
                onClick={() => setShowPresets(true)}
              >
                From Template
              </button>
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
              <li className="list-empty">
                No hooks configured
              </li>
            )}
            {isProjectScope && hooks.length === 0 && globalHooks.length === 0 && (
              <li className="list-empty">
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
                <div
                  key={gi}
                  className={`hook-group hook-group-draggable${dragOverIndex === gi ? " hook-group-drag-over" : ""}`}
                  draggable={editing.groups.length > 1}
                  onDragStart={(e) => handleDragStart(e, gi)}
                  onDragOver={(e) => handleDragOver(e, gi)}
                  onDragLeave={handleDragLeave}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDropOnEditor(e, gi)}
                >
                  <div className="hook-group-header">
                    {editing.groups.length > 1 && (
                      <span className="hook-group-drag-handle" title="Drag to reorder">&#8942;&#8942;</span>
                    )}
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
                          <option value="agent">Agent</option>
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

                      {(handler.hookType === "prompt" || handler.hookType === "agent") && (
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

                      {handler.hookType === "command" && (
                        <div className="form-group">
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={handler.async ?? false}
                              onChange={(e) =>
                                updateHandler(gi, hi, (h) => ({
                                  ...h,
                                  async: e.target.checked || null,
                                }))
                              }
                            />
                            Run asynchronously
                          </label>
                        </div>
                      )}

                      <div className="form-group">
                        <label>Status Message (optional)</label>
                        <input
                          type="text"
                          value={handler.statusMessage ?? ""}
                          onChange={(e) =>
                            updateHandler(gi, hi, (h) => ({
                              ...h,
                              statusMessage: e.target.value || null,
                            }))
                          }
                          placeholder="Shown while hook runs..."
                        />
                      </div>

                      {(handler.hookType === "prompt" || handler.hookType === "agent") && (
                        <div className="form-group">
                          <label>Model (optional)</label>
                          <input
                            type="text"
                            value={handler.model ?? ""}
                            onChange={(e) =>
                              updateHandler(gi, hi, (h) => ({
                                ...h,
                                model: e.target.value || null,
                              }))
                            }
                            placeholder="e.g. claude-haiku-4-5-20251001"
                          />
                        </div>
                      )}

                      <div className="form-group">
                        <label>Timeout (seconds, optional)</label>
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
                {selectedIsGlobal && <span className="badge-global">global</span>}
              </h3>
              {selectedIsGlobal && (
                <p className="global-readonly-hint">
                  This hook is defined in the global scope. Switch to Global Settings to edit it.
                </p>
              )}
              {selected!.groups.map((group, gi) => (
                <div
                  key={gi}
                  className={`hook-group-detail${!selectedIsGlobal && selected!.groups.length > 1 ? " hook-group-draggable" : ""}${dragOverIndex === gi ? " hook-group-drag-over" : ""}${group._disabled ? " entity-disabled" : ""}`}
                  draggable={!selectedIsGlobal && selected!.groups.length > 1}
                  onDragStart={!selectedIsGlobal ? (e) => handleDragStart(e, gi) : undefined}
                  onDragOver={!selectedIsGlobal ? (e) => handleDragOver(e, gi) : undefined}
                  onDragLeave={!selectedIsGlobal ? handleDragLeave : undefined}
                  onDragEnd={!selectedIsGlobal ? handleDragEnd : undefined}
                  onDrop={!selectedIsGlobal ? (e) => handleDropOnDetail(e, gi) : undefined}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {!selectedIsGlobal && selected!.groups.length > 1 && (
                      <span className="hook-group-drag-handle" title="Drag to reorder">&#8942;&#8942;</span>
                    )}
                    <h4>Group {gi + 1}</h4>
                    {!selectedIsGlobal && (
                      <button
                        className={`btn-icon toggle-btn ${group._disabled ? "toggle-disabled" : "toggle-enabled"}`}
                        onClick={() => handleToggleGroupEnabled(selected!.event, gi, !!group._disabled)}
                        title={group._disabled ? "Enable group" : "Disable group"}
                      >
                        {group._disabled ? "off" : "on"}
                      </button>
                    )}
                  </div>
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
                      {handler.async && (
                        <div className="detail-field">
                          <label>Async</label>
                          <span>Yes</span>
                        </div>
                      )}
                      {handler.statusMessage && (
                        <div className="detail-field">
                          <label>Status Message</label>
                          <code>{handler.statusMessage}</code>
                        </div>
                      )}
                      {handler.model && (
                        <div className="detail-field">
                          <label>Model</label>
                          <code>{handler.model}</code>
                        </div>
                      )}
                      {handler.timeout && (
                        <div className="detail-field">
                          <label>Timeout</label>
                          <code>{handler.timeout}s</code>
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
      {showPresets && (
        <PresetPicker
          title="Hook Templates"
          presets={HOOK_PRESETS}
          onSelect={handleSelectPreset}
          onClose={() => setShowPresets(false)}
        />
      )}
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
