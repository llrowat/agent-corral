# Contributing to AgentCorral

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) (platform-specific system libraries)

### Getting Started

```bash
# Clone the repo
git clone https://github.com/llrowat/agent-corral.git
cd agent-corral

# Install frontend dependencies
npm install

# Run in development mode (starts Vite + Tauri)
npm run tauri dev

# Build for production
npm run tauri build
```

## Project Structure

- `backend/` — Rust backend (Tauri app, state management, IPC commands)
  - `src/commands/` — 12 Tauri IPC command handler modules (one per domain)
  - `src/preferences.rs` — App-level preferences (terminal emulator, plugin sync interval)
  - `src/repo_registry/` — SQLite-based repository management
  - `src/session_manager/` — Session tracking, process lifecycle, git worktree management
  - `src/claude_adapter/` — Claude Code file format adapter (agents, hooks, skills, MCP, memory)
  - `src/plugin_manager/` — Plugin system with import sync registry
  - `src/pack_manager/` — Legacy pack system (kept for migration)
  - `src/command_templates/` — Template engine with variable substitution
  - `src/terminal_launcher/` — Native terminal spawning (per-platform)
- `frontend/` — React + TypeScript frontend
  - `components/` — 10 shared UI components (Sidebar, ScopeSwitcher, ScopeGuard, RepoSwitcher, ConfigSummary, DocsLink, InlineValidation, PresetPicker, QuickSetup, CreateWithAiModal)
  - `pages/` — 12 page components
  - `hooks/` — React hooks (useRepos, useSessions, usePluginSync)
  - `lib/` — Tauri IPC bindings + built-in presets
- See `CLAUDE.md` for detailed architecture notes

## How to Contribute

### Reporting Bugs

Open an issue using the bug report template. Include:
- Steps to reproduce
- Expected vs actual behavior
- OS and version

### Suggesting Features

Open an issue describing the use case and proposed solution.

### Submitting Code

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Add tests for new or modified functionality (see Testing below)
4. Ensure all tests pass: `cd backend && cargo test --lib` and `npm test`
5. Ensure the build succeeds: `npm run tauri build`
6. Submit a pull request

### Code Style

- **Rust**: Follow standard `rustfmt` conventions
- **TypeScript/React**: Follow the existing patterns in the codebase
- Keep changes focused — one feature or fix per PR

## Testing

Tests are required for every change. CI runs on all PRs and pushes to `main`.

```bash
# Run Rust backend unit tests
cd backend && cargo test --lib

# Run frontend tests
npm test

# Run frontend tests in watch mode
npm run test:watch
```

- **Rust backend**: Add `#[cfg(test)] mod tests { ... }` blocks inline in the module being tested. Use `tempfile::tempdir()` for tests that need filesystem access. Test both the happy path and error cases.
- **Frontend**: Use Vitest + React Testing Library. Test files live next to the source files they test (e.g., `Foo.test.tsx` next to `Foo.tsx`). Mock Tauri `invoke` calls via the setup in `frontend/test/setup.ts`.
- **Test naming**: Use descriptive names (e.g., `delete_nonexistent_agent_fails`, not `test_delete`).
- **CI**: GitHub Actions workflow (`.github/workflows/test.yml`) runs both Rust and frontend tests. All tests must pass before merge.

## Architecture Guidelines

- **ClaudeRepoAdapter** isolates all Claude file format concerns. Never read/write Claude config files directly outside this module.
- **Atomic file writes** everywhere — write to `.tmp`, then rename.
- **Tauri IPC commands** go in `backend/src/commands/`. Each domain gets its own file.
- **TypeScript bindings** in `frontend/lib/tauri.ts` must stay in sync with Rust command signatures.
- **Presets** live in `frontend/lib/presets.ts`. When adding new built-in presets, follow the existing pattern (typed preset objects with id, label, description, and the entity payload).
- **Plugin import sync** — When importing plugins, the import registry (`{repo}/.claude/plugin-imports.json`) tracks each import. Use the sync APIs to manage updates, not direct file manipulation.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
