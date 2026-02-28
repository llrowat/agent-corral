<p align="center">
  <img src="assets/agent_corral_icon_black.png" alt="AgentCorral" width="200" />
</p>

<h1 align="center">AgentCorral</h1>

<p align="center"><strong>Claude Code Workspace Manager</strong> — a desktop app for managing Claude Code agents, configs, hooks, skills, MCP servers, memory, sessions, and plugins across your repositories.</p>

Built with [Tauri v2](https://v2.tauri.app/) + React (TypeScript) + Rust.

## Features

- **Global + Project Scope** — Manage Claude Code configuration at the global (`~/.claude/`) or project (`{repo}/.claude/`) level with a scope selector in the header.
- **Repo Registry** — Add and switch between multiple repositories. See at a glance which repos have Claude configs, agents, hooks, skills, MCP servers, and memory.
- **Agent Studio** — Create, edit, and delete Claude Code agents with a visual editor. Configure tools, model overrides, and memory bindings. Includes built-in presets (code reviewer, test writer, doc writer, refactorer, and more).
- **Hooks Editor** — Manage Claude Code hooks (PreToolUse, PostToolUse, Notification, Stop, SubagentStop) with a form UI. Built-in hook presets available.
- **Skills Editor** — Create and manage skills with YAML frontmatter and markdown content.
- **MCP Servers** — Configure Model Context Protocol servers at global or project scope.
- **Config Studio** — Edit Claude Code settings (model, permissions, ignore patterns) with a form UI. See raw JSON and shareability tags.
- **Memory Studio** — Manage memory stores and entries. Create/delete stores, add/edit/delete individual entries inline.
- **Session Manager** — Launch terminal sessions, view active sessions, resume sessions, focus terminal windows, and auto-cleanup when terminals close. Supports **git worktree isolation** — run sessions in an isolated worktree with their own branch, view diffs, and merge changes back. Session activity monitoring (active/idle/exited).
- **Plugin System** — Directory-based plugin format bundling agents, skills, hooks, MCP servers, and command templates. Import/export, install from git, auto-update, and import sync (track, pin, auto-sync imported plugins).
- **Command Templates** — Built-in and custom command templates with variable substitution. Launch Claude Code sessions from the UI. Templates can default to worktree isolation.
- **Create with AI** — Generate agents, skills, hooks, or MCP server configs from a natural-language description by launching Claude Code with a tailored prompt.
- **Quick Setup** — First-run wizard detects repos with no Claude config and offers starter templates to bootstrap a working setup in one click.
- **Settings** — Configure terminal emulator preference and plugin sync interval.
- **Inline Validation** — Real-time form validation with auto-fix suggestions for IDs and slugs.
- **Docs Links** — Each feature page links to the corresponding Anthropic documentation.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain) — after installing, restart your terminal so `cargo` is in your PATH
- Platform-specific Tauri v2 dependencies — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

> **Note:** The first build will download and compile ~300 Rust crates, which can take several minutes. Subsequent builds are incremental and much faster.

### Install & Run

```bash
# Clone the repo
git clone https://github.com/llrowat/agent-corral.git
cd agent-corral

# Install frontend dependencies
npm install

# Run in development mode (starts Vite dev server + Tauri)
npm run tauri dev

# Build for production
npm run tauri build
```

## Project Structure

```
agent-corral/
├── backend/            # Rust backend (Tauri app)
│   ├── src/
│   │   ├── lib.rs              # App entry, state management
│   │   ├── main.rs             # Binary entry
│   │   ├── preferences.rs      # App preferences (terminal emulator, plugin sync interval)
│   │   ├── commands/           # Tauri IPC command handlers (12 modules)
│   │   ├── repo_registry/      # SQLite repo management
│   │   ├── session_manager/    # Session tracking, process lifecycle, window focus, git worktree lifecycle
│   │   ├── claude_adapter/     # Claude Code file format adapter (agents, hooks, skills, MCP, memory)
│   │   ├── plugin_manager/     # Plugin export/import/git install/update, import sync registry
│   │   ├── pack_manager/       # Legacy pack system (kept for migration)
│   │   ├── command_templates/  # Template engine with variable substitution
│   │   └── terminal_launcher/  # Native terminal spawning (per-platform)
│   └── tauri.conf.json
├── frontend/           # React frontend
│   ├── components/     # Shared UI components (10 components)
│   ├── pages/          # Page components (12 pages)
│   ├── hooks/          # React hooks (useRepos, useSessions, usePluginSync)
│   ├── lib/            # Tauri API bindings + built-in presets
│   ├── types/          # TypeScript type definitions
│   └── styles.css      # Global styles (dark theme)
├── .github/workflows/  # CI (Rust + frontend tests)
├── Cargo.toml          # Workspace root
├── package.json        # Frontend dependencies
└── vite.config.ts      # Vite configuration
```

## Plugin System

Plugins use a directory-based format (`.claude-plugin/plugin.json`) bundling agents, skills, hooks, MCP servers, and command templates. They can be:

- **Exported** from any repo (choose which agents, skills, hooks, MCP servers, and templates to include)
- **Imported** into any repo (preview changes before applying, choose add-only or overwrite mode)
- **Installed from Git** — point to any git repo containing a `.claude-plugin/` directory
- **Updated** — git-sourced plugins track their source commit and can be checked for updates
- **Auto-synced** — imported plugins can be tracked and automatically updated when the library version changes. Supports pinning (lock version) and auto-sync toggles per import.
- **Migrated** — legacy `.agentpack` files can be converted to the new plugin format

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
