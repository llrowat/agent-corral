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
│   │   ├── session_manager/    # Session envelope reader
│   │   ├── claude_adapter/     # Claude Code file format adapter
│   │   └── terminal_launcher/  # Native terminal spawning
│   └── tauri.conf.json
├── bridge/             # Bridge CLI (standalone Rust binary)
│   └── src/main.rs     # Session wrapping, log tee, envelope writing
├── src/                # React frontend
│   ├── components/     # Shared UI components
│   ├── pages/          # Page components (Overview, Agents, Config, etc.)
│   ├── hooks/          # React hooks
│   ├── lib/            # Tauri API bindings
│   ├── types/          # TypeScript type definitions
│   └── styles.css      # Global styles
├── Cargo.toml          # Workspace root
├── package.json        # Frontend dependencies
└── vite.config.ts      # Vite configuration
```

## Key Architecture Decisions

- **ClaudeRepoAdapter** isolates all Claude file format concerns. Never read/write Claude config files directly outside this module.
- **Bridge CLI** (`agentcorral-bridge`) is a separate binary that wraps commands with session tracking. It writes JSON envelopes and tees output to log files.
- **Session Manager** reads envelope JSON files from the sessions directory. The bridge CLI writes them.
- **Atomic file writes** are used everywhere to prevent corruption (write to .tmp, then rename).

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

- Phase 1: Bridge CLI, Terminal Launcher, Session Manager, Repo Registry (CURRENT)
- Phase 2: Config Studio, Agent Studio with full CRUD
- Phase 3: Memory Studio
- Phase 4: Pack system (export/import .agentpack)
- Phase 5: Polish, installer packaging
