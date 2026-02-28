# AgentCorral - Claude Code Command Center

## Project Structure

This is a Tauri v2 + React (TypeScript) desktop application with a Rust backend.

```
agent-corral/
├── src-tauri/          # Rust backend (Tauri app)
│   ├── src/
│   │   ├── lib.rs              # App entry, state management
│   │   ├── main.rs             # Binary entry
│   │   ├── commands/           # Tauri IPC command handlers
│   │   ├── repo_registry/      # SQLite repo management
│   │   ├── session_manager/    # Session tracking, process lifecycle, window focus
│   │   ├── claude_adapter/     # Claude Code file format adapter (agents, hooks, skills, MCP, memory)
│   │   ├── plugin_manager/     # Plugin export/import/git install/update (directory-based)
│   │   ├── pack_manager/       # Legacy pack system (.agentpack JSON, kept for migration)
│   │   ├── command_templates/  # Template engine with variable substitution
│   │   └── terminal_launcher/  # Native terminal spawning (per-platform)
│   └── tauri.conf.json
├── src/                # React frontend
│   ├── components/     # Shared UI components (Sidebar, ScopeSwitcher)
│   ├── pages/          # Page components (Overview, Agents, Hooks, Skills, MCP, Config, Memory, Sessions, Plugins, Settings)
│   ├── hooks/          # React hooks (useRepos, useSessions)
│   ├── lib/            # Tauri API bindings
│   ├── types/          # TypeScript type definitions
│   └── styles.css      # Global styles (dark theme)
├── Cargo.toml          # Workspace root
├── package.json        # Frontend dependencies
└── vite.config.ts      # Vite configuration
```

## Key Architecture Decisions

- **Global + Project Scope** — The app supports managing Claude Code config at both the global (`~/.claude/`) and project (`{repo}/.claude/`) level. Most adapters work for both by passing the appropriate base path. MCP is the exception: global uses `~/.claude.json`, project uses `{repo}/.mcp.json`.
- **ClaudeRepoAdapter** isolates all Claude file format concerns. Never read/write Claude config files directly outside this module. Handles agents, hooks (settings.json), skills (.claude/skills/), MCP servers, and memory stores.
- **Plugin Manager** uses a directory-based format (`.claude-plugin/plugin.json`) that bundles agents, skills, hooks, and MCP servers. Replaces the legacy `.agentpack` JSON format.
- **Session Manager** tracks launched terminal sessions via JSON envelope files. Records PID on launch, auto-cleans dead sessions (via `GetExitCodeProcess` on Windows), and supports focusing/killing terminal windows.
- **Terminal Launcher** spawns commands directly in a new console window (no bridge). On Windows uses `CREATE_NEW_CONSOLE` flag.
- **Atomic file writes** are used everywhere to prevent corruption (write to .tmp, then rename).
- **Agent metadata sidecar files** (`.meta.json`) store tools, model override, and memory binding alongside `.md` agent files.
- **Plugin git source sidecars** (`.claude-plugin/source.json`) track the git origin, branch, and installed commit for git-sourced plugins.
- **Command Templates** use `{{variable}}` substitution with a `shell_quote` helper for safe command construction.

### Plugin Directory Format

```
my-plugin/
  .claude-plugin/plugin.json    # { name, description, version, author }
  .claude-plugin/source.json    # git tracking (for git-installed plugins)
  agents/                       # agent .md + .meta.json files
  skills/                       # skill dirs with SKILL.md (YAML frontmatter + markdown)
  hooks/hooks.json              # { hooks: [...] }
  .mcp.json                     # { mcpServers: { ... } }
  settings.json                 # repo config defaults
```

## Development

```bash
# Install frontend deps
npm install

# Run in dev mode (starts both Vite and Tauri)
npm run tauri dev

# Build for production
npm run tauri build
```

## Build Phases

- Phase 1: Bridge CLI, Terminal Launcher, Session Manager, Repo Registry
- Phase 2: Config Studio, Agent Studio with full CRUD
- Phase 3: Memory Studio
- Phase 4: Pack system (legacy, kept for migration)
- Phase 5: Hooks, Skills, MCP management pages
- Phase 6: Plugin system (directory-based, replaces packs)
- Phase 7: Polish, installer packaging
