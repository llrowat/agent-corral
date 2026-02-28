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
- `frontend/` — React + TypeScript frontend
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
3. Ensure the build succeeds: `npm run tauri build`
4. Submit a pull request

### Code Style

- **Rust**: Follow standard `rustfmt` conventions
- **TypeScript/React**: Follow the existing patterns in the codebase
- Keep changes focused — one feature or fix per PR

## Architecture Guidelines

- **ClaudeRepoAdapter** isolates all Claude file format concerns. Never read/write Claude config files directly outside this module.
- **Atomic file writes** everywhere — write to `.tmp`, then rename.
- **Tauri IPC commands** go in `backend/src/commands/`. Each domain gets its own file.
- **TypeScript bindings** in `frontend/lib/tauri.ts` must stay in sync with Rust command signatures.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
