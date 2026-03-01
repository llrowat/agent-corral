# AgentCorral — Feature Recommendations for a "Killer App"

## Current State Assessment

AgentCorral is a well-architected Tauri v2 desktop app that covers the core Claude Code configuration surface area: agents, hooks, skills, MCP servers, memory, config (settings.json), and a plugin system with git-based distribution. It has schema-driven forms, AI-powered entity creation, built-in presets, and a QuickSetup wizard. The dual-scope model (global + project) is cleanly implemented throughout.

The foundation is solid. What follows are the gaps — ranked by impact — that would elevate this from a useful config editor into a tool that Claude Code users can't live without.

---

## Tier 1: High-Impact, Core Gaps

### 1. CLAUDE.md Editor

**The single biggest missing feature.** CLAUDE.md is _the_ most important Claude Code configuration file — it's the project instruction set that shapes every session. Yet AgentCorral has no way to view or edit it.

**What to build:**
- A dedicated page (or panel within Overview) for editing CLAUDE.md with a live markdown preview
- Split-pane editor: raw markdown on the left, rendered preview on the right
- Detect existing CLAUDE.md on page load; offer to create one from a template if absent
- Template library (similar to StarterTemplates) with common CLAUDE.md patterns: coding standards, architecture notes, PR conventions, testing requirements
- Support for both root `CLAUDE.md` and nested `CLAUDE.md` files in subdirectories
- Show the global `~/.claude/CLAUDE.md` when in global scope

**Why it matters:** Every serious Claude Code project has a CLAUDE.md. Users currently edit it by hand in their code editor. A dedicated editor with templates and preview would save setup time and help users write better instructions.

---

### 2. Effective Config Preview (Merged View)

Claude Code config is hierarchical — global settings are overridden by project settings. Users currently have no way to see the **effective** configuration that Claude Code will actually use.

**What to build:**
- A read-only "Effective Config" panel on the Overview page (or a dedicated tab on Config Studio)
- Shows the merged result: global config + project config, with source annotations ("from global", "project override")
- Covers all config areas: model, permissions, ignore patterns, hooks, MCP servers
- Highlights conflicts and overrides visually (e.g., strikethrough on overridden global values)

**Why it matters:** Debugging "why isn't Claude using tool X?" is a common pain point. This eliminates guesswork about what config is actually in effect.

---

### 3. MCP Server Health Check & Tool Discovery

Users can configure MCP servers but have no way to verify they work or see what tools they expose.

**What to build:**
- A "Test Connection" button on each MCP server card that attempts to start the server process and check for a successful handshake
- A "Discover Tools" action that lists the tools the server exposes (via MCP's `tools/list` method)
- Status indicators: green (healthy), yellow (configured but not tested), red (failed)
- Show last-checked timestamp

**Why it matters:** MCP server misconfiguration is the #1 pain point for Claude Code users. A health check eliminates trial-and-error debugging.

---

### 4. Agent Testing / Quick Launch

Users can create agents but can't test them without switching to their terminal.

**What to build:**
- A "Test Agent" button on the agent detail view that opens Claude Code in a new terminal with `--agent <agent-id>` flag
- A "Quick Prompt" inline text field that launches a one-shot Claude Code session with the selected agent and a user-provided prompt
- Show the exact CLI command that would invoke the agent (copy-to-clipboard)

**Why it matters:** The create → test → refine loop for agents is currently slow. Tight integration between the editor and the runtime makes iteration fast.

---

### 5. Config Version History & Diff

Configuration changes are currently fire-and-forget. There's no way to see what changed, when, or revert.

**What to build:**
- Track config snapshots in a local SQLite table (or a `.claude/history/` directory) every time a save occurs
- Show a timeline of changes per entity type (agents, hooks, skills, config, MCP)
- Inline diff view: before vs. after for each change
- One-click revert to any previous snapshot
- Optionally, detect and surface git-tracked changes to `.claude/` files

**Why it matters:** "I broke my agent prompt and can't remember what it was before" is a real scenario. History makes config changes safe to experiment with.

---

## Tier 2: Differentiation Features

### 6. Search & Filter Across All Entities

As configurations grow, finding things becomes painful. There's no search.

**What to build:**
- A global search bar (Cmd+K / Ctrl+K) that searches across agents, skills, hooks, MCP servers, memory entries, and config
- Results grouped by entity type with quick navigation
- Filter/sort within each page's list (e.g., filter agents by tool, skills by invocable status)

---

### 7. Keyboard Shortcuts

A desktop power-user tool without keyboard shortcuts feels incomplete.

**What to build:**
- `Cmd+K` / `Ctrl+K` — Global search (see #6)
- `Cmd+S` / `Ctrl+S` — Save current entity
- `Cmd+N` / `Ctrl+N` — New entity (context-aware based on current page)
- `Cmd+Z` / `Ctrl+Z` — Undo last change (see #5)
- `1-9` — Navigate to pages via sidebar (with a modifier key)
- Show shortcuts in tooltips and a help modal

---

### 8. Toast Notifications (Replace alert())

The app currently uses `alert()` and `confirm()` for all user feedback. This blocks the UI and feels jarring.

**What to build:**
- A toast/notification system (bottom-right or top-right)
- Success toasts for saves, imports, exports
- Error toasts with "Show Details" expandable
- Confirm dialogs as inline modals (already partially done for delete confirmations)

---

### 9. Bulk Operations & Enable/Disable Toggle

No way to temporarily disable an entity without deleting it.

**What to build:**
- An enable/disable toggle for agents, hooks, skills, and MCP servers
- "Disabled" entities are preserved on disk but excluded from the active config (e.g., commented out or moved to a `.disabled` suffix)
- Bulk select + delete/disable/enable for list views
- Duplicate entity action (clone with "copy-of-" prefix)

---

### 10. Community Plugin Registry

The git install feature is manual — users need to know the repo URL.

**What to build:**
- A "Browse Community" tab in the Plugins page
- Curated list of popular plugins (stored as a JSON manifest at a known URL, or a GitHub repo with a registry file)
- Search, filter by category (testing, security, documentation, etc.)
- One-click install
- Star/rating system (if hosted centrally) or download count

---

### 11. Config Backup & Restore

No way to backup or restore an entire project's Claude Code configuration.

**What to build:**
- "Export All Config" — bundles CLAUDE.md + .claude/ directory + .mcp.json into a single archive
- "Import Config" — restores from archive with merge/overwrite options
- "Snapshot" — quick-save current state with a name and timestamp
- Auto-snapshot before destructive operations (plugin imports, bulk deletes)

---

### 12. Cross-Reference Visualization

Users can't see how entities relate to each other.

**What to build:**
- A dependency graph or relationship view showing:
  - Which agents reference which memory stores
  - Which hooks run on which tool events (and which agents use those tools)
  - Which skills restrict which tools
- Highlight orphaned entities (memory stores not bound to any agent, etc.)
- Warning badges for misconfigurations (e.g., agent references a memory store that doesn't exist)

---

## Tier 3: Polish & Advanced

### 13. Dark/Light Theme Toggle

The app has a dark theme (per styles.css) but no way to switch to a light theme.

### 14. Multi-Language Starter Templates

The current starter templates cover Web (React/Node), Python, and Rust. Add Go, Java/Kotlin, Swift, C#/.NET, and Ruby.

### 15. Drag & Drop Reordering

Let users reorder agents, hooks, and skills via drag-and-drop in the sidebar lists. Order can matter for hooks (execution priority).

### 16. Import from Existing Project

A "Scan & Import" wizard that detects an existing Claude Code setup in a project and imports all entities into AgentCorral's management, rather than requiring users to manually recreate them.

### 17. Session Analytics Integration

If Claude Code ever exposes session logs or usage data, show analytics: which agents are used most, average session length, most-invoked skills, etc.

### 18. Config Linting & Best Practices

A "Health Score" widget on the Overview page that checks for common configuration issues:
- Missing CLAUDE.md
- No ignore patterns configured
- Agents with no description
- Hooks with no timeout set
- MCP servers with placeholder env vars (e.g., `<your-token-here>`)
- Skills marked user_invocable but with empty content

---

## Implementation Priority

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| P0 | CLAUDE.md Editor (#1) | Medium | Very High |
| P0 | Effective Config Preview (#2) | Low | High |
| P0 | MCP Health Check (#3) | Medium | High |
| P1 | Agent Quick Launch (#4) | Low | High |
| P1 | Toast Notifications (#8) | Low | Medium |
| P1 | Search (#6) | Medium | High |
| P1 | Config History (#5) | Medium | High |
| P2 | Keyboard Shortcuts (#7) | Low | Medium |
| P2 | Enable/Disable Toggle (#9) | Medium | Medium |
| P2 | Config Backup/Restore (#11) | Medium | Medium |
| P2 | Community Registry (#10) | High | High |
| P3 | Cross-Reference Viz (#12) | High | Medium |
| P3 | Config Linting (#18) | Medium | Medium |
| P3 | Other polish items (#13–17) | Low each | Low each |

---

## Summary

The three features that would most transform AgentCorral into a "killer app" are:

1. **CLAUDE.md Editor** — because it's the most-used config file and has zero support today
2. **Effective Config Preview** — because it solves the #1 debugging pain point (global vs project resolution)
3. **MCP Health Check** — because MCP misconfiguration is the most common Claude Code setup failure

These three alone would make AgentCorral the definitive tool for managing Claude Code environments. Everything else builds on that foundation.
