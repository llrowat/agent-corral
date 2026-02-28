import { useState } from "react";
import * as api from "@/lib/tauri";

export type AiEntityType = "agent" | "skill" | "hook" | "mcp";

interface Props {
  entityType: AiEntityType;
  repoPath: string;
  onClose: () => void;
  onCreated: () => void;
}

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
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
        "2. Create a markdown file at .claude/agents/<slug-id>.md containing the system prompt. Choose an appropriate slug ID based on the description (lowercase, hyphens only, e.g. \"code-reviewer\").",
        "3. Create a matching metadata sidecar file at .claude/agents/<slug-id>.meta.json with this exact JSON structure:",
        '   {"name": "Agent Display Name", "tools": [], "modelOverride": null, "memoryBinding": null}',
        "4. Choose appropriate tools from this list if the agent needs restricted tools: Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, TodoWrite, NotebookEdit, Task. Leave tools as [] to grant access to all tools.",
        "5. Make the system prompt detailed, well-structured, and effective for the described use case.",
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
        "4. Available tools: Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, TodoWrite, NotebookEdit, Task.",
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
  { title: string; commandName: string; placeholder: string }
> = {
  agent: {
    title: "Create Agent with AI",
    commandName: "AI Create Agent",
    placeholder:
      "e.g. A code review agent that focuses on security vulnerabilities and suggests fixes...",
  },
  skill: {
    title: "Create Skill with AI",
    commandName: "AI Create Skill",
    placeholder:
      "e.g. A skill that generates unit tests for the current file using the project's testing framework...",
  },
  hook: {
    title: "Create Hook with AI",
    commandName: "AI Create Hook",
    placeholder:
      "e.g. A pre-tool-use hook that runs ESLint before any Write operations...",
  },
  mcp: {
    title: "Set up MCP Server with AI",
    commandName: "AI Setup MCP",
    placeholder:
      "e.g. Set up the filesystem MCP server so Claude can browse project files...",
  },
};

export function CreateWithAiModal({
  entityType,
  repoPath,
  onClose,
  onCreated,
}: Props) {
  const [description, setDescription] = useState("");
  const [launching, setLaunching] = useState(false);

  const label = LABELS[entityType];

  const handleLaunch = async () => {
    if (!description.trim()) {
      alert("Please provide a description");
      return;
    }

    setLaunching(true);
    try {
      const prompt = buildPrompt(entityType, description.trim());
      const command = `claude -p ${shellEscape(prompt)}`;
      await api.launchSession(repoPath, label.commandName, command);
      onCreated();
      onClose();
    } catch (e) {
      alert(`Failed to launch session: ${e}`);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{label.title}</h3>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          Describe what you want and Claude Code will create it in a terminal
          session.
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
      </div>
    </div>
  );
}
