import { useEffect, useState, useCallback } from "react";
import type { Scope } from "@/types";
import * as api from "@/lib/tauri";
import { useToast } from "@/components/Toast";
import { ScopeBanner } from "@/components/ScopeGuard";
import { DocsLink } from "@/components/DocsLink";

interface Props {
  scope: Scope | null;
  homePath: string | null;
}

const CLAUDE_MD_TEMPLATES = [
  {
    id: "general",
    label: "General Project",
    content: `# Project Instructions

## Overview
[Describe your project here]

## Coding Standards
- Write clean, readable code with meaningful variable names
- Add comments only where the logic is non-obvious
- Follow existing patterns in the codebase

## Testing
- Every change must include tests
- Run the test suite before committing

## Architecture
[Describe key architectural decisions]

## Common Patterns
[Describe patterns Claude should follow]
`,
  },
  {
    id: "typescript",
    label: "TypeScript / React",
    content: `# Project Instructions

## Tech Stack
- TypeScript with strict mode
- React (functional components, hooks)
- CSS Modules / Tailwind for styling

## Conventions
- Use named exports (not default exports)
- Prefer \`interface\` over \`type\` for object shapes
- Use \`const\` by default, \`let\` only when mutation is needed
- No \`any\` types — use \`unknown\` and narrow

## File Structure
- Components: PascalCase directories with index.tsx
- Hooks: camelCase with \`use\` prefix
- Tests: colocated \`.test.tsx\` files

## Testing
- Use Vitest + React Testing Library
- Test behavior, not implementation
- Mock external dependencies, not internal modules
`,
  },
  {
    id: "python",
    label: "Python",
    content: `# Project Instructions

## Tech Stack
- Python 3.11+
- Type hints required on all functions
- Use dataclasses or Pydantic models

## Conventions
- Follow PEP 8 style guide
- Use f-strings for formatting
- Prefer pathlib over os.path
- Use \`logging\` module, not print statements

## Testing
- pytest with fixtures
- Tests in \`tests/\` directory mirroring source structure
- Aim for >80% coverage on new code

## Dependencies
- Add to pyproject.toml, not requirements.txt
- Pin major versions
`,
  },
  {
    id: "rust",
    label: "Rust",
    content: `# Project Instructions

## Conventions
- Use \`thiserror\` for error types
- Prefer \`&str\` over \`String\` in function parameters
- Use \`clippy\` lints: run \`cargo clippy\` before committing
- Document public APIs with \`///\` doc comments

## Error Handling
- Use \`Result<T, E>\` — no panics in library code
- Use \`anyhow\` in binaries, \`thiserror\` in libraries
- Propagate errors with \`?\`, don't unwrap

## Testing
- Inline \`#[cfg(test)] mod tests\` blocks
- Use \`tempfile::tempdir()\` for filesystem tests
- Test both happy path and error cases
`,
  },
];

export function ClaudeMdPage({ scope, homePath }: Props) {
  const toast = useToast();
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [globalContent, setGlobalContent] = useState("");
  const [nestedFiles, setNestedFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const basePath =
    scope?.type === "global"
      ? scope.homePath
      : scope?.type === "project"
        ? scope.repo.path
        : null;
  const isProjectScope = scope?.type === "project";

  const loadContent = useCallback(async () => {
    if (!basePath) return;
    setLoading(true);
    try {
      const [md, nested] = await Promise.all([
        api.readClaudeMd(basePath),
        api.listClaudeMdFiles(basePath).catch(() => [] as string[]),
      ]);
      setContent(md);
      setSavedContent(md);
      setNestedFiles(nested);
    } catch {
      setContent("");
      setSavedContent("");
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  const loadGlobal = useCallback(async () => {
    if (!isProjectScope || !homePath) {
      setGlobalContent("");
      return;
    }
    try {
      const md = await api.readClaudeMd(homePath);
      setGlobalContent(md);
    } catch {
      setGlobalContent("");
    }
  }, [isProjectScope, homePath]);

  useEffect(() => {
    loadContent();
    loadGlobal();
  }, [loadContent, loadGlobal]);

  const isDirty = content !== savedContent;
  const isEmpty = !savedContent;

  const handleSave = async () => {
    if (!basePath) return;
    try {
      await api.writeClaudeMd(basePath, content);
      setSavedContent(content);
      toast.success("CLAUDE.md saved");
    } catch (e) {
      toast.error("Failed to save CLAUDE.md", String(e));
    }
  };

  const handleDiscard = () => {
    setContent(savedContent);
  };

  const handleApplyTemplate = (template: (typeof CLAUDE_MD_TEMPLATES)[number]) => {
    setContent(template.content);
    setShowTemplates(false);
  };

  if (!scope) {
    return (
      <div className="page page-empty">
        <p>Select a scope to edit CLAUDE.md.</p>
      </div>
    );
  }

  return (
    <div className="page claude-md-page">
      <ScopeBanner scope={scope} />
      <div className="page-header">
        <h2>
          CLAUDE.md <DocsLink page="config" />
        </h2>
        <div className="header-actions">
          {isEmpty && (
            <button
              className="btn btn-sm"
              onClick={() => setShowTemplates(true)}
            >
              From Template
            </button>
          )}
          <button
            className="btn btn-sm"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? "Editor" : "Preview"}
          </button>
        </div>
      </div>

      <p className="page-description">
        Project instructions that Claude Code reads at the start of every
        session. This is the most important configuration file — it shapes
        Claude's behavior for your entire project.
      </p>

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : (
        <>
          {isEmpty && !isDirty && (
            <div className="claude-md-empty">
              <h3>No CLAUDE.md Found</h3>
              <p>
                Create a CLAUDE.md to give Claude Code project-specific
                instructions.
              </p>
              <div className="form-actions" style={{ justifyContent: "center" }}>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowTemplates(true)}
                >
                  Start from Template
                </button>
                <button
                  className="btn"
                  onClick={() => setContent("# Project Instructions\n\n")}
                >
                  Start Blank
                </button>
              </div>
            </div>
          )}

          {(isDirty || !isEmpty) && (
            <div className="claude-md-editor-layout">
              {showPreview ? (
                <div className="claude-md-preview">
                  <MarkdownPreview content={content} />
                </div>
              ) : (
                <textarea
                  className="claude-md-editor"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="# Project Instructions&#10;&#10;Write your Claude Code instructions here..."
                  spellCheck={false}
                />
              )}
            </div>
          )}

          {isDirty && (
            <div className="config-save-bar" data-testid="save-bar">
              <span>You have unsaved changes</span>
              <div className="config-save-actions">
                <button className="btn" onClick={handleDiscard}>
                  Discard
                </button>
                <button className="btn btn-primary" onClick={handleSave}>
                  Save CLAUDE.md
                </button>
              </div>
            </div>
          )}

          {/* Nested CLAUDE.md files */}
          {nestedFiles.length > 0 && (
            <div className="claude-md-nested" style={{ marginTop: 24 }}>
              <h3>Nested CLAUDE.md Files</h3>
              <p className="text-muted">
                Additional CLAUDE.md files found in subdirectories:
              </p>
              <ul className="nested-file-list">
                {nestedFiles.map((file) => (
                  <li key={file}>
                    <code>{file}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Global CLAUDE.md reference */}
          {isProjectScope && globalContent && (
            <div className="claude-md-global" style={{ marginTop: 24 }}>
              <div className="global-section-header">
                <span className="global-section-label">
                  Global CLAUDE.md
                </span>
                <span className="global-section-hint">
                  Switch to Global Settings to edit
                </span>
              </div>
              <pre className="prompt-preview" style={{ maxHeight: 200 }}>
                {globalContent}
              </pre>
            </div>
          )}
        </>
      )}

      {showTemplates && (
        <div className="modal-overlay" onClick={() => setShowTemplates(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>CLAUDE.md Templates</h3>
            <div className="preset-grid">
              {CLAUDE_MD_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  className="preset-card"
                  onClick={() => handleApplyTemplate(t)}
                >
                  <span className="preset-label">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => setShowTemplates(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Lightweight markdown renderer — renders headings, lists, code blocks, paragraphs */
function MarkdownPreview({ content }: { content: string }) {
  if (!content) {
    return <p className="text-muted">Nothing to preview.</p>;
  }

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={elements.length} className="prompt-preview">
          {codeLines.join("\n")}
        </pre>
      );
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      elements.push(<h4 key={elements.length}>{line.slice(4)}</h4>);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<h3 key={elements.length}>{line.slice(3)}</h3>);
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(<h2 key={elements.length}>{line.slice(2)}</h2>);
      i++;
      continue;
    }

    // List items
    if (line.match(/^[-*] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={elements.length}>
          {items.map((item, j) => (
            <li key={j}>{item}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph
    elements.push(<p key={elements.length}>{line}</p>);
    i++;
  }

  return <div className="markdown-preview-content">{elements}</div>;
}
