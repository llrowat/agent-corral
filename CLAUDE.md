# AgentCorral - Claude Code Configuration Manager

## Project Structure

This is a Tauri v2 + React (TypeScript) desktop application with a Rust backend. The app focuses on managing Claude Code configuration — agents, hooks, skills, MCP servers, memory, and plugins — at both global and project scope.

```
agent-corral/
├── backend/            # Rust backend (Tauri app)
│   ├── src/
│   │   ├── lib.rs              # App entry, state management
│   │   ├── main.rs             # Binary entry
│   │   ├── preferences.rs      # App preferences (plugin sync interval)
│   │   ├── commands/           # Tauri IPC command handlers
│   │   │   ├── claude.rs       #   Agent CRUD
│   │   │   ├── hooks.rs        #   Hooks management
│   │   │   ├── mcp.rs          #   MCP servers
│   │   │   ├── pack.rs         #   Legacy pack system
│   │   │   ├── plugin.rs       #   Plugin system + import sync
│   │   │   ├── preferences.rs  #   App preferences
│   │   │   ├── repo.rs         #   Repository registry
│   │   │   └── skills.rs       #   Skills
│   │   ├── repo_registry/      # SQLite repo management
│   │   ├── claude_adapter/     # Claude Code file format adapter (agents, hooks, skills, MCP, memory)
│   │   ├── plugin_manager/     # Plugin export/import/git install/update, import sync registry
│   │   └── pack_manager/       # Legacy pack system (.agentpack JSON, kept for migration)
│   └── tauri.conf.json
├── frontend/           # React frontend
│   ├── components/     # Shared UI components
│   │   ├── Sidebar            # Navigation sidebar
│   │   ├── ScopeSwitcher      # Global/Project scope selector
│   │   ├── ScopeGuard         # Scope protection wrapper
│   │   ├── RepoSwitcher       # Repository selection
│   │   ├── ConfigSummary      # Configuration overview widget
│   │   ├── DocsLink           # Links to Anthropic docs per feature
│   │   ├── InlineValidation   # Form validation with auto-fix suggestions
│   │   ├── PresetPicker       # Generic preset selection modal
│   │   ├── QuickSetup         # First-run setup wizard with starter presets
│   │   └── CreateWithAiModal  # AI-powered entity creation (launches terminal)
│   ├── pages/          # Page components
│   │   ├── OverviewPage       # Dashboard with config summary
│   │   ├── AgentsPage         # Agent studio (create/edit/delete)
│   │   ├── HooksPage          # Hooks editor
│   │   ├── SkillsPage         # Skills management
│   │   ├── McpPage            # MCP servers configuration
│   │   ├── ConfigPage         # Settings/configuration editor
│   │   ├── MemoryPage         # Memory stores and entries
│   │   ├── PluginsPage        # Plugin system UI with import sync
│   │   ├── PacksPage          # Legacy pack management
│   │   └── SettingsPage       # App preferences (plugin sync interval)
│   ├── hooks/          # React hooks
│   │   ├── useRepos           # Repository list
│   │   └── usePluginSync      # Plugin import sync polling
│   ├── lib/            # Shared libraries
│   │   ├── tauri              # Tauri IPC API bindings
│   │   └── presets            # Built-in presets (agents, hooks, skills, MCP, config, starter presets)
│   ├── types/          # TypeScript type definitions
│   └── styles.css      # Global styles (dark theme)
├── .github/workflows/  # CI (test.yml runs Rust + frontend tests)
├── Cargo.toml          # Workspace root
├── package.json        # Frontend dependencies
└── vite.config.ts      # Vite configuration
```

## Key Architecture Decisions

- **Global + Project Scope** — The app supports managing Claude Code config at both the global (`~/.claude/`) and project (`{repo}/.claude/`) level. Most adapters work for both by passing the appropriate base path. MCP is the exception: global uses `~/.claude.json`, project uses `{repo}/.mcp.json`.
- **ClaudeRepoAdapter** isolates all Claude file format concerns. Never read/write Claude config files directly outside this module. Handles agents, hooks (settings.json), skills (.claude/skills/), MCP servers, and memory stores.
- **Plugin Manager** uses a directory-based format (`.claude-plugin/plugin.json`) that bundles agents, skills, hooks, and MCP servers. Replaces the legacy `.agentpack` JSON format. Includes an **import sync registry** that tracks which plugins have been imported into a repo, their source commits, and supports auto-sync (periodic pull of updates from git-sourced plugins), pinning (lock a plugin to its current version), and unlink (remove tracking).
- **Preferences Manager** (`preferences.rs`) stores app-level settings like plugin sync interval. Uses atomic writes. Persisted to `{app_data_dir}/preferences.json`.
- **Atomic file writes** are used everywhere to prevent corruption (write to .tmp, then rename).
- **Agent metadata sidecar files** (`.meta.json`) store tools, model override, and memory binding alongside `.md` agent files.
- **Plugin git source sidecars** (`.claude-plugin/source.json`) track the git origin, branch, and installed commit for git-sourced plugins.
- **Built-in Presets** (`frontend/lib/presets.ts`) provide ready-made configurations for agents (code reviewer, test writer, doc writer, refactorer, etc.), hooks, skills, MCP servers, config, and starter presets for the QuickSetup wizard.
- **QuickSetup Wizard** (`QuickSetup`) detects repos with no Claude config and offers starter presets to bootstrap a working setup in one click.
- **Inline Validation** (`InlineValidation`) provides real-time form validation for agent IDs, skill IDs, and server IDs with auto-fix suggestions (e.g., converting invalid slugs to valid ones).
- **Create with AI** (`CreateWithAiModal`) launches Claude Code in a terminal with a tailored prompt to generate agents, skills, hooks, or MCP server configs from a natural-language description. Uses a lightweight terminal launcher (no session tracking).
- **Docs Links** (`DocsLink`) links each feature page to the corresponding Anthropic documentation (agents, hooks, skills, MCP, config, memory).
- **Pack-to-Plugin Migration** — The `migrate_agentpack` command converts legacy `.agentpack` files to the new directory-based plugin format.

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

## Testing

Tests are required for every change. CI runs on all PRs and pushes to `main`.

### Running Tests

```bash
# Run Rust backend unit tests
cd backend && cargo test --lib

# Run frontend tests
npm test

# Run frontend tests in watch mode
npm run test:watch
```

### Testing Requirements

- **Every PR must include tests** for new or modified functionality. Do not merge code without corresponding test coverage.
- **Rust backend**: Add `#[cfg(test)] mod tests { ... }` blocks inline in the module being tested. Use `tempfile::tempdir()` for tests that need filesystem access. Test both the happy path and error cases.
- **Frontend**: Use Vitest + React Testing Library. Test files live next to the source files they test (e.g., `Foo.test.tsx` next to `Foo.tsx`). Mock Tauri `invoke` calls via the setup in `frontend/test/setup.ts`.
- **Test naming**: Use descriptive names that explain what is being tested (e.g., `delete_nonexistent_agent_fails`, not `test_delete`).
- **CI**: GitHub Actions workflow (`.github/workflows/test.yml`) runs both Rust and frontend tests. All tests must pass before merge.

### Test Structure

- `backend/src/*/mod.rs` — Inline `#[cfg(test)]` modules for Rust unit tests
- `frontend/**/*.test.ts` / `frontend/**/*.test.tsx` — Frontend test files (Vitest)
- `frontend/test/setup.ts` — Vitest global setup (Tauri mock, jest-dom matchers)

## Documentation

- **Update README after each change** — When a change affects project structure, features, configuration, commands, or public-facing behavior, update the README (and any other relevant documentation) to reflect the change. Documentation should stay in sync with the code at all times.

## Build Phases

- Phase 1: Repo Registry, Config Studio
- Phase 2: Agent Studio with full CRUD
- Phase 3: Memory Studio
- Phase 4: Pack system (legacy, kept for migration)
- Phase 5: Hooks, Skills, MCP management pages
- Phase 6: Plugin system (directory-based, replaces packs), import sync, auto-update
- Phase 7: Built-in presets, QuickSetup wizard, inline validation, preferences
- Phase 8: Polish, installer packaging
