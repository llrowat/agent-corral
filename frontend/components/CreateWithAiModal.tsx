import { useState, useRef, useCallback, useEffect } from "react";
import * as api from "@/lib/tauri";

export type AiEntityType = "agent" | "skill" | "hook" | "mcp";

interface Props {
  entityType: AiEntityType;
  repoPath: string;
  onClose: () => void;
  onCreated: () => void;
}

function buildPrompt(entityType: AiEntityType, description: string): string {
  switch (entityType) {
    case "agent":
      return [
        "Create a new Claude Code agent based on this description:",
        "",
        description,
        "",
        "Instructions:",
        "1. Create the .claude/agents/ directory if it doesn't exist.",
        '2. Create a markdown file at .claude/agents/<slug-id>.md with YAML frontmatter and system prompt body. Choose an appropriate slug ID based on the description (lowercase, hyphens only, e.g. "code-reviewer").',
        "3. The file must have YAML frontmatter delimited by --- lines at the top, followed by the system prompt in markdown. Example structure:",
        "   ---",
        '   name: "Agent Display Name"',
        '   description: "Brief description of what the agent does"',
        '   tools: "Read, Write, Edit, Bash, Glob, Grep"',
        '   model: "sonnet"',
        "   ---",
        "",
        "   System prompt instructions go here...",
        "",
        "4. The tools field is a comma-separated string. Choose from: Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, TodoWrite, NotebookEdit, Agent, CronCreate, CronList, CronDelete. Omit the tools field entirely to grant access to all tools.",
        "5. The model field is optional. Valid values: sonnet, opus, haiku. Omit to use the default model.",
        "6. Do NOT create a .meta.json sidecar file.",
        "7. Make the system prompt detailed, well-structured, and effective for the described use case.",
      ].join("\n");

    case "skill":
      return [
        "Create a new Claude Code skill based on this description:",
        "",
        description,
        "",
        "Instructions:",
        "1. Create the .claude/skills/ directory if it doesn't exist.",
        "2. Create a skill directory at .claude/skills/<slug-id>/ with a SKILL.md file inside it. Choose an appropriate slug ID (lowercase, hyphens only).",
        "3. The SKILL.md file must have YAML frontmatter delimited by --- lines at the top, followed by the skill content in markdown. Example structure:",
        "   ---",
        '   name: "Skill Display Name"',
        '   description: "Brief description of what the skill does"',
        "   user_invocable: true",
        "   allowed_tools:",
        "     - Read",
        "     - Write",
        "     - Edit",
        "     - Bash",
        "     - Glob",
        "     - Grep",
        "   ---",
        "",
        "   Skill instructions go here in markdown...",
        "",
        "4. Available tools: Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, TodoWrite, NotebookEdit, Task, CronCreate, CronList, CronDelete.",
        "5. Write clear, detailed skill instructions below the frontmatter.",
      ].join("\n");

    case "hook":
      return [
        "Create or update Claude Code hooks based on this description:",
        "",
        description,
        "",
        "Instructions:",
        "1. Read the existing .claude/settings.json file (or create it with {} if it doesn't exist).",
        '2. Add hooks under the "hooks" key. The format is:',
        "   {",
        '     "hooks": {',
        '       "EventType": [',
        "         {",
        '           "matcher": "optional-regex-pattern",',
        '           "hooks": [',
        '             { "type": "command", "command": "shell command here" }',
        "           ]",
        "         }",
        "       ]",
        "     }",
        "   }",
        "3. Available event types: PreToolUse, PostToolUse, Notification, Stop, SubagentStop.",
        '4. Hook handler types: "command" (runs a shell command) or "prompt" (sends a prompt to Claude).',
        '5. The "matcher" field is an optional regex pattern to match tool names (for PreToolUse/PostToolUse events).',
        "6. Preserve any existing settings in the file - only add/modify the hooks section.",
      ].join("\n");

    case "mcp":
      return [
        "Set up an MCP (Model Context Protocol) server based on this description:",
        "",
        description,
        "",
        "Instructions:",
        "1. Edit the .mcp.json file in the project root (create it if it doesn't exist).",
        '2. Add the server configuration under the "mcpServers" key. The format is:',
        "   {",
        '     "mcpServers": {',
        '       "server-id": {',
        '         "type": "stdio",',
        '         "command": "command-to-run",',
        '         "args": ["arg1", "arg2"],',
        '         "env": { "KEY": "value" }',
        "       }",
        "     }",
        "   }",
        "3. Server types:",
        '   - "stdio": Command-based (requires "command" and optional "args")',
        '   - "sse": Server-Sent Events (requires "url")',
        '   - "http": HTTP-based (requires "url")',
        "4. Preserve any existing servers in the file - only add the new one.",
        "5. Use appropriate npm packages or commands for the described MCP server.",
      ].join("\n");
  }
}

const LABELS: Record<
  AiEntityType,
  { title: string; placeholder: string }
> = {
  agent: {
    title: "Create Agent with AI",
    placeholder:
      "e.g. A code review agent that focuses on security vulnerabilities and suggests fixes...",
  },
  skill: {
    title: "Create Skill with AI",
    placeholder:
      "e.g. A skill that generates unit tests for the current file using the project's testing framework...",
  },
  hook: {
    title: "Create Hook with AI",
    placeholder:
      "e.g. A pre-tool-use hook that runs ESLint before any Write operations...",
  },
  mcp: {
    title: "Set up MCP Server with AI",
    placeholder:
      "e.g. Set up the filesystem MCP server so Claude can browse project files...",
  },
};

type ModalState = "input" | "waiting" | "done" | "error";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 300_000; // 5 minutes

export function CreateWithAiModal({
  entityType,
  repoPath,
  onClose,
  onCreated,
}: Props) {
  const [description, setDescription] = useState("");
  const [launching, setLaunching] = useState(false);
  const [state, setState] = useState<ModalState>("input");
  const [errorMsg, setErrorMsg] = useState("");
  const pidRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const label = LABELS[entityType];

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const handleLaunch = async () => {
    if (!description.trim()) {
      return;
    }

    setLaunching(true);
    try {
      const prompt = buildPrompt(entityType, description.trim());
      const command = await api.prepareAiCommand(repoPath, prompt);
      const pid = await api.launchTerminal(repoPath, command);
      pidRef.current = pid;
      setState("waiting");

      // Poll process state until it exits
      pollRef.current = setInterval(async () => {
        if (pidRef.current === null) return;
        try {
          const alive = await api.isProcessAlive(pidRef.current);
          if (!alive) {
            cleanup();
            setState("done");
            onCreated();
          }
        } catch {
          // polling error, keep trying
        }
      }, POLL_INTERVAL_MS);

      // Timeout after 5 minutes
      timeoutRef.current = setTimeout(() => {
        cleanup();
        setState("done");
        onCreated();
      }, TIMEOUT_MS);
    } catch (e) {
      setErrorMsg(`Failed to launch terminal: ${e}`);
      setState("error");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={state === "input" ? onClose : undefined}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {state === "input" && (
          <>
            <h3>{label.title}</h3>
            <p className="text-muted" style={{ marginBottom: 16 }}>
              Describe what you want and Claude Code will create it in a
              terminal window.
            </p>
            <div className="form-group">
              <label>Description</label>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={label.placeholder}
                autoFocus
              />
            </div>
            <div className="form-actions">
              <button
                className="btn btn-primary"
                onClick={handleLaunch}
                disabled={launching || !description.trim()}
              >
                {launching ? "Launching..." : "Create with AI"}
              </button>
              <button className="btn" onClick={onClose} disabled={launching}>
                Cancel
              </button>
            </div>
          </>
        )}

        {state === "waiting" && (
          <>
            <h3>Creating with AI...</h3>
            <p className="text-muted" style={{ marginBottom: 16 }}>
              Claude Code is working in a terminal window. This modal will
              update automatically when the process finishes.
            </p>
            <div className="ai-create-progress">
              <div className="ai-create-spinner" />
              <span>Running</span>
            </div>
            <div className="form-actions">
              <button
                className="btn"
                onClick={() => {
                  cleanup();
                  onCreated();
                  onClose();
                }}
              >
                Close &amp; Continue
              </button>
            </div>
          </>
        )}

        {state === "done" && (
          <>
            <h3>Complete</h3>
            <p className="text-muted" style={{ marginBottom: 16 }}>
              Claude Code has finished. The list has been refreshed with any new
              items.
            </p>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}

        {state === "error" && (
          <>
            <h3>Error</h3>
            <p className="text-muted" style={{ marginBottom: 16 }}>
              {errorMsg}
            </p>
            <div className="form-actions">
              <button className="btn" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
