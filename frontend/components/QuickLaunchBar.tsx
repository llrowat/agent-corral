import { useState, useEffect, useCallback, useRef } from "react";
import type { Repo, Agent, CommandTemplate } from "@/types";
import { TemplateCrudModal } from "./TemplateCrudModal";
import * as api from "@/lib/tauri";

interface Props {
  repoPath: string | null;
  repos: Repo[];
  onLaunch: (
    repoPath: string,
    commandName: string,
    command: string,
    useWorktree: boolean
  ) => void;
}

export function QuickLaunchBar({ repoPath, repos, onLaunch }: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [templates, setTemplates] = useState<CommandTemplate[]>([]);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [showCustomMenu, setShowCustomMenu] = useState(false);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [useWorktree, setUseWorktree] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [repoPicker, setRepoPicker] = useState<string>("");
  const [pendingAction, setPendingAction] = useState<
    ((repo: string) => void) | null
  >(null);
  const promptRef = useRef<HTMLInputElement>(null);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const customMenuRef = useRef<HTMLDivElement>(null);

  const effectiveRepo = repoPath ?? (repoPicker || null);
  const needsRepoPicker = !repoPath;

  const loadAgents = useCallback(async () => {
    if (!effectiveRepo) {
      setAgents([]);
      return;
    }
    try {
      const result = await api.readAgents(effectiveRepo);
      setAgents(result);
    } catch {
      setAgents([]);
    }
  }, [effectiveRepo]);

  const loadTemplates = useCallback(async () => {
    try {
      const result = await api.listTemplates();
      setTemplates(result);
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (showPromptInput && promptRef.current) {
      promptRef.current.focus();
    }
  }, [showPromptInput]);

  // Close dropdown menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        showAgentMenu &&
        agentMenuRef.current &&
        !agentMenuRef.current.contains(e.target as Node)
      ) {
        setShowAgentMenu(false);
      }
      if (
        showCustomMenu &&
        customMenuRef.current &&
        !customMenuRef.current.contains(e.target as Node)
      ) {
        setShowCustomMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAgentMenu, showCustomMenu]);

  const doLaunch = useCallback(
    (commandName: string, command: string, worktree: boolean, repo?: string) => {
      const target = repo ?? effectiveRepo;
      if (!target) return;
      onLaunch(target, commandName, command, worktree);
    },
    [effectiveRepo, onLaunch]
  );

  const requireRepo = useCallback(
    (action: (repo: string) => void) => {
      if (effectiveRepo) {
        action(effectiveRepo);
        return;
      }
      if (repos.length === 1) {
        action(repos[0].path);
        return;
      }
      setPendingAction(() => action);
    },
    [effectiveRepo, repos]
  );

  const launchBuiltin = useCallback(
    async (templateId: string, vars: Record<string, string> = {}) => {
      const tpl = templates.find((t) => t.templateId === templateId);
      if (!tpl) return;
      try {
        const rendered = await api.renderTemplate(tpl, vars);
        doLaunch(tpl.name, rendered, useWorktree, vars.repoPath);
      } catch (e) {
        alert(`Failed to launch: ${e}`);
      }
    },
    [templates, doLaunch, useWorktree]
  );

  const handleRunClaude = () => {
    requireRepo((repo) => launchBuiltin("run-claude", { repoPath: repo }));
  };

  const handleRunChat = () => {
    requireRepo((repo) => launchBuiltin("run-chat", { repoPath: repo }));
  };

  const handleRunAgent = (agentId: string) => {
    setShowAgentMenu(false);
    requireRepo((repo) =>
      launchBuiltin("run-agent", { repoPath: repo, agentId })
    );
  };

  const handlePromptSubmit = () => {
    const text = promptText.trim();
    if (!text) return;
    requireRepo((repo) => {
      launchBuiltin("run-prompt", { repoPath: repo, prompt: text });
      setPromptText("");
      setShowPromptInput(false);
    });
  };

  const handleCustomLaunch = async (tpl: CommandTemplate) => {
    setShowCustomMenu(false);
    setUseWorktree(tpl.useWorktree);

    const vars: Record<string, string> = {};

    requireRepo(async (repo) => {
      vars.repoPath = repo;

      if (tpl.requires.includes("agent")) {
        const agentId = window.prompt("Enter agent ID:");
        if (!agentId) return;
        vars.agentId = agentId;
      }
      if (tpl.requires.includes("prompt")) {
        const prompt = window.prompt("Enter prompt:");
        if (!prompt) return;
        vars.prompt = prompt;
      }

      try {
        const rendered = await api.renderTemplate(tpl, vars);
        doLaunch(tpl.name, rendered, tpl.useWorktree, repo);
      } catch (e) {
        alert(`Failed to launch: ${e}`);
      }
    });
  };

  const handleRepoPickerConfirm = () => {
    if (!repoPicker || !pendingAction) return;
    pendingAction(repoPicker);
    setPendingAction(null);
  };

  const customTemplates = templates.filter(
    (t) => !["run-claude", "run-chat", "run-agent", "run-prompt"].includes(t.templateId)
  );

  return (
    <>
      <div className="quick-launch-bar">
        <div className="quick-launch-actions">
          <button className="btn btn-primary btn-sm" onClick={handleRunClaude}>
            Run Claude
          </button>
          <button className="btn btn-sm" onClick={handleRunChat}>
            Run Chat
          </button>

          <div className="quick-launch-dropdown" ref={agentMenuRef}>
            <button
              className="btn btn-sm"
              onClick={() => {
                setShowAgentMenu(!showAgentMenu);
                setShowCustomMenu(false);
              }}
            >
              Run Agent {showAgentMenu ? "\u25B4" : "\u25BE"}
            </button>
            {showAgentMenu && (
              <div className="quick-launch-menu">
                {agents.length === 0 ? (
                  <div className="quick-launch-menu-empty">
                    {effectiveRepo
                      ? "No agents found in this repo"
                      : "Select a project to see agents"}
                  </div>
                ) : (
                  agents.map((a) => (
                    <button
                      key={a.agentId}
                      className="quick-launch-menu-item"
                      onClick={() => handleRunAgent(a.agentId)}
                    >
                      <span className="quick-launch-menu-name">{a.name}</span>
                      <span className="quick-launch-menu-id">{a.agentId}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {showPromptInput ? (
            <div className="quick-launch-prompt-input">
              <input
                ref={promptRef}
                type="text"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handlePromptSubmit();
                  if (e.key === "Escape") {
                    setShowPromptInput(false);
                    setPromptText("");
                  }
                }}
                placeholder="Enter prompt and press Enter..."
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handlePromptSubmit}
                disabled={!promptText.trim()}
              >
                Go
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setShowPromptInput(false);
                  setPromptText("");
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="btn btn-sm"
              onClick={() => setShowPromptInput(true)}
            >
              Run with Prompt...
            </button>
          )}

          {customTemplates.length > 0 && (
            <div className="quick-launch-dropdown" ref={customMenuRef}>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setShowCustomMenu(!showCustomMenu);
                  setShowAgentMenu(false);
                }}
              >
                Custom {showCustomMenu ? "\u25B4" : "\u25BE"}
              </button>
              {showCustomMenu && (
                <div className="quick-launch-menu">
                  {customTemplates.map((tpl) => (
                    <button
                      key={tpl.templateId}
                      className="quick-launch-menu-item"
                      onClick={() => handleCustomLaunch(tpl)}
                    >
                      <span className="quick-launch-menu-name">
                        {tpl.name}
                      </span>
                      <span className="quick-launch-menu-id">
                        {tpl.description}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="quick-launch-options">
          <label className="quick-launch-worktree-toggle">
            <input
              type="checkbox"
              checked={useWorktree}
              onChange={(e) => setUseWorktree(e.target.checked)}
            />
            Worktree
          </label>
          <button
            className="btn btn-sm"
            onClick={() => {
              setShowManageModal(true);
              setShowAgentMenu(false);
              setShowCustomMenu(false);
            }}
          >
            Manage Launchers
          </button>
        </div>

        {needsRepoPicker && pendingAction && (
          <div className="quick-launch-repo-picker">
            <span className="text-muted">Select project:</span>
            <select
              value={repoPicker}
              onChange={(e) => setRepoPicker(e.target.value)}
            >
              <option value="">Choose a repo...</option>
              {repos.map((r) => (
                <option key={r.repo_id} value={r.path}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleRepoPickerConfirm}
              disabled={!repoPicker}
            >
              Launch
            </button>
            <button
              className="btn btn-sm"
              onClick={() => setPendingAction(null)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {showManageModal && (
        <TemplateCrudModal
          onClose={() => {
            setShowManageModal(false);
            loadTemplates();
          }}
        />
      )}
    </>
  );
}
