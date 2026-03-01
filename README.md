<p align="center">
  <img src="assets/agent_corral_icon_black.png" alt="AgentCorral" width="200" />
</p>

<h1 align="center">AgentCorral</h1>

<p align="center"><strong>Claude Code Configuration Management Studio</strong></p>

---

### Howdy, partner.

You've got Claude Code agents scattered across a dozen repos. Hooks defined in one project that you wish you had in another. MCP servers configured globally when they should be scoped to a project — or the other way around. Skills buried in directories you forgot existed. Memory stores you set up once and never touched again because, frankly, the JSON was a pain to wrangle by hand.

**That's the mess.** Claude Code is powerful, but its configuration lives in a tangle of dotfiles, JSON blobs, YAML frontmatter, and markdown spread across `~/.claude/` and every project's `.claude/` directory. There's no single place to see what you've got, no easy way to share setups between repos, and no guard rails when you're hand-editing config at 2am.

**AgentCorral rounds it all up.** This is your Claude Code configuration management studio — a desktop app that gives you a visual, unified interface to wrangle every piece of your Claude Code setup:

- **See everything at a glance** — One dashboard across all your repos. Know instantly which projects have agents, hooks, skills, MCP servers, and memory configured.
- **Stop copy-pasting JSON** — Visual editors for agents, hooks, skills, MCP servers, config, and memory. Built-in presets so you're not starting from scratch.
- **Share setups across repos** — The plugin system bundles your agents, skills, hooks, and MCP servers into portable packages. Export from one repo, import into another, or install directly from git.
- **Keep configs in sync** — Import sync tracks which plugins you've pulled into each repo, auto-updates them when the source changes, and lets you pin versions when you need stability.
- **Global or project, your call** — Flip between global (`~/.claude/`) and project-scoped (`.claude/`) config with a single toggle. See exactly what applies where.
- **Share config with your team through git** — Export your agents, skills, hooks, and MCP servers as a plugin, host it in a git repo, and teammates can install it in one step. Import sync keeps everyone up to date automatically when the source repo changes.
- **Bootstrap new repos fast** — The Quick Setup wizard detects unconfigured repos and offers starter presets to get a full Claude Code setup running in one click.

No more digging through dotfiles. No more wondering which repo has that hook you wrote last month. No more breaking your config because you missed a comma in a JSON file.

**Saddle up. Your agents ain't gonna wrangle themselves.**

Built with [Tauri v2](https://v2.tauri.app/) + React (TypeScript) + Rust.

---

## Features

### Core Management
- **Global + Project Scope** — Manage Claude Code configuration at the global (`~/.claude/`) or project (`{repo}/.claude/`) level with a scope selector in the header.
- **Repo Registry** — Add and switch between multiple repositories. See at a glance which repos have Claude configs, agents, hooks, skills, MCP servers, and memory.
- **Agent Studio** — Create, edit, and delete Claude Code agents with a visual editor. Configure tools, model overrides, and memory bindings. Includes built-in presets (code reviewer, test writer, doc writer, refactorer, and more).
- **Hooks Editor** — Manage Claude Code hooks (PreToolUse, PostToolUse, Notification, Stop, SubagentStop) with a form UI. Built-in hook presets. Drag & drop reordering for hook execution priority.
- **Skills Editor** — Create and manage skills with YAML frontmatter and markdown content.
- **MCP Servers** — Configure Model Context Protocol servers at global or project scope. Health check per server to verify availability.
- **Config Studio** — Edit Claude Code settings (model, permissions, ignore patterns) with a form UI. See raw JSON and shareability tags.
- **Memory Studio** — Manage memory stores and entries. Create/delete stores, add/edit/delete individual entries inline.
- **CLAUDE.md Viewer** — Read-only view of your project's CLAUDE.md with markdown preview, nested file discovery, and a Claude Code prompt you can copy to generate a tailored CLAUDE.md for your project. (CLAUDE.md is version-controlled source — edit it in your code editor.)

### Visibility & Insights
- **Effective Config Preview** — See the merged result of global + project configuration with source annotations ("from global", "project override") for each setting.
- **Config Health Score** — Automated linting widget that checks for common issues: missing CLAUDE.md, no model configured, agents with short prompts, hooks without timeouts, MCP placeholder env vars, and more.
- **Cross-Reference Visualization** — See how entities relate: which agents bind to which memory stores, hook coverage by event, orphaned entities, and dangling references.
- **Config Version History** — Snapshot settings.json at any point, view timeline, and one-click restore to any previous state.

### Productivity
- **Global Search** — Cmd+K / Ctrl+K search overlay that indexes all agents, hooks, skills, MCP servers, and memory stores with instant navigation.
- **Keyboard Shortcuts** — Cmd/Ctrl+1-9 for page navigation, Cmd+K for search.
- **Agent Quick Launch** — One-click terminal launch with `claude --agent <id>`, copy CLI command to clipboard.
- **Toast Notifications** — Non-blocking success/error/info/warning notifications throughout the app (no more alert() popups).
- **Enable/Disable Toggle** — Temporarily disable agents, skills, hooks, or MCP servers without deleting them.
- **Drag & Drop Reordering** — Reorder hook groups via drag-and-drop (execution order matters for hooks).

### Import & Export
- **Plugin System** — Directory-based plugin format bundling agents, skills, hooks, and MCP servers. Import/export, install from git, auto-update, and import sync (track, pin, auto-sync imported plugins).
- **Config Backup & Restore** — Export Claude Code configuration (agents, skills, hooks, MCP servers, settings) as a JSON bundle. Import with merge or overwrite modes. CLAUDE.md is excluded since it's version-controlled.
- **Import from Existing Project** — Scan wizard to discover Claude Code config in any project directory and register it in AgentCorral.
- **Create with AI** — Generate agents, skills, hooks, or MCP server configs from a natural-language description by launching Claude Code in a terminal window.

### Polish
- **Dark/Light Theme** — Toggle between dark and light themes with persistent preference.
- **Multi-Language Starter Templates** — Quick Setup templates for TypeScript/React, Python, Rust, Go, Java/Kotlin, C#/.NET, Swift, and Ruby.
- **Quick Setup** — First-run wizard detects repos with no Claude config and offers starter presets to bootstrap a working setup in one click.
- **Schema-Driven Forms** — Entity editors generated dynamically from JSON Schema definitions. The settings.json schema is fetched at runtime from [SchemaStore](https://json.schemastore.org/claude-code-settings.json).
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
│   │   ├── preferences.rs      # App preferences (plugin sync interval)
│   │   ├── commands/           # Tauri IPC command handlers (8 modules)
│   │   ├── repo_registry/      # SQLite repo management
│   │   ├── claude_adapter/     # Claude Code file format adapter (agents, hooks, skills, MCP, memory)
│   │   ├── plugin_manager/     # Plugin export/import/git install/update, import sync registry
│   │   └── pack_manager/       # Legacy pack system (kept for migration)
│   └── tauri.conf.json
├── frontend/           # React frontend
│   ├── components/     # Shared UI components (15+ components)
│   ├── pages/          # Page components (12 pages)
│   ├── hooks/          # React hooks (useRepos, usePluginSync, useKeyboardShortcuts, useSchema)
│   ├── lib/            # Tauri API bindings, built-in presets, JSON schemas
│   ├── types/          # TypeScript type definitions
│   └── styles.css      # Global styles (dark + light themes)
├── .github/workflows/  # CI (Rust + frontend tests)
├── Cargo.toml          # Workspace root
├── package.json        # Frontend dependencies
└── vite.config.ts      # Vite configuration
```

## Plugin System

Plugins use a directory-based format (`.claude-plugin/plugin.json`) bundling agents, skills, hooks, and MCP servers. They can be:

- **Exported** from any repo (choose which agents, skills, hooks, and MCP servers to include)
- **Imported** into any repo (preview changes before applying, choose add-only or overwrite mode)
- **Installed from Git** — point to any git repo containing a `.claude-plugin/` directory
- **Updated** — git-sourced plugins track their source commit and can be checked for updates
- **Auto-synced** — imported plugins can be tracked and automatically updated when the library version changes. Supports pinning (lock version) and auto-sync toggles per import.
- **Migrated** — legacy `.agentpack` files can be converted to the new plugin format

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
