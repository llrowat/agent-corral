# AgentCorral

**Claude Code Command Center** — a desktop app for managing Claude Code agents, configs, memory, sessions, and shareable packs across your repositories.

Built with [Tauri v2](https://v2.tauri.app/) + React (TypeScript) + Rust.

## Features

- **Repo Registry** — Add and switch between multiple repositories. See at a glance which repos have Claude configs, agents, and memory.
- **Agent Studio** — Create, edit, and delete Claude Code agents with a visual editor. Configure tools, model overrides, and memory bindings.
- **Config Studio** — Edit Claude Code settings (model, permissions, ignore patterns) with a form UI. See raw JSON and shareability tags.
- **Memory Studio** — Manage memory stores and entries. Create stores, add/edit/delete individual entries inline.
- **Session Dashboard** — View running and past Claude Code sessions, filter by status, tail logs in real time, and re-run commands.
- **Pack System** — Export agents and config as portable `.agentpack` files. Share packs with your team.
  - **Git Install** — Install packs directly from any public or private git repository.
  - **Versioning** — Packs have semver versions. Bump versions when publishing updates.
  - **Auto-Update** — Check git-sourced packs for updates and pull the latest with one click.
- **Command Templates** — Built-in and custom command templates with variable substitution. Launch Claude Code sessions from the UI.
- **Bridge CLI** — Standalone `agentcorral-bridge` binary wraps commands with session tracking, writing JSON envelopes and teeing output to log files.

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
├── src-tauri/          # Rust backend (Tauri app)
│   ├── src/
│   │   ├── lib.rs              # App entry, state management
│   │   ├── main.rs             # Binary entry
│   │   ├── commands/           # Tauri IPC command handlers
│   │   ├── repo_registry/      # SQLite repo management
│   │   ├── session_manager/    # Session envelope reader
│   │   ├── claude_adapter/     # Claude Code file format adapter
│   │   ├── pack_manager/       # Pack export/import/git install
│   │   ├── command_templates/  # Template engine with variable substitution
│   │   └── terminal_launcher/  # Native terminal spawning
│   └── tauri.conf.json
├── bridge/             # Bridge CLI (standalone Rust binary)
│   └── src/main.rs     # Session wrapping, log tee, envelope writing
├── src/                # React frontend
│   ├── components/     # Shared UI components (Sidebar, RepoSwitcher)
│   ├── pages/          # Page components (Overview, Agents, Config, etc.)
│   ├── hooks/          # React hooks (useRepos, useSessions)
│   ├── lib/            # Tauri API bindings
│   ├── types/          # TypeScript type definitions
│   └── styles.css      # Global styles (dark theme)
├── Cargo.toml          # Workspace root
├── package.json        # Frontend dependencies
└── vite.config.ts      # Vite configuration
```

## Pack System

Packs are portable `.agentpack` files (JSON) containing agents, config, and metadata. They can be:

- **Exported** from any repo with the export wizard
- **Imported** into any repo with merge conflict preview (add-only or overwrite)
- **Installed from Git** — point to any public or private git repo containing `.agentpack` files
- **Updated** — git-sourced packs track their source commit and can be updated when the remote changes

### Installing a pack from Git

1. Go to the **Packs** page
2. Click **Install from Git**
3. Enter the repository URL (HTTPS or SSH) and optional branch
4. The repo is cloned, scanned for `.agentpack` files, and installed to your library

### Checking for updates

Click **Check Updates** on the Packs page. Git-sourced packs will be checked against their remote repositories. Packs with available updates show a yellow indicator and an **Update** button.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
