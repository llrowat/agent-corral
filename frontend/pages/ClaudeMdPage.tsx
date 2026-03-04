import { useEffect, useState, useCallback } from "react";
import type { Scope } from "@/types";
import * as api from "@/lib/tauri";
import type { MarkdownReference } from "@/lib/tauri";
import { useToast } from "@/components/Toast";
import { ScopeBanner } from "@/components/ScopeGuard";
import { DocsLink } from "@/components/DocsLink";

interface Props {
  scope: Scope | null;
  homePath: string | null;
}

const CLAUDE_MD_PROMPT = `Analyze this project and create a CLAUDE.md file in the project root. The file should contain:

1. A brief project overview (what it does, key technologies)
2. Coding standards specific to this codebase (naming conventions, patterns you see already in use)
3. Architecture notes (key directories, how the code is organized, important abstractions)
4. Testing requirements (test framework in use, where tests live, how to run them)
5. Build and development commands
6. Any patterns or conventions you can infer from the existing code

Keep it concise and practical — focus on things that would help an AI coding assistant work effectively in this repo. Don't include generic advice; base everything on what you actually see in the codebase.`;

export function ClaudeMdPage({ scope, homePath }: Props) {
  const toast = useToast();
  const [content, setContent] = useState("");
  const [globalContent, setGlobalContent] = useState("");
  const [nestedFiles, setNestedFiles] = useState<string[]>([]);
  const [mdRefs, setMdRefs] = useState<MarkdownReference[]>([]);
  const [expandedRef, setExpandedRef] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      const [md, nested, refs] = await Promise.all([
        api.readClaudeMd(basePath),
        api.listClaudeMdFiles(basePath).catch(() => [] as string[]),
        api.listMarkdownReferences(basePath).catch(() => [] as MarkdownReference[]),
      ]);
      setContent(md);
      setNestedFiles(nested);
      setMdRefs(refs);
    } catch {
      setContent("");
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

  const isEmpty = !content;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(CLAUDE_MD_PROMPT).then(
      () => toast.success("Prompt copied — paste it into Claude Code"),
      () => toast.error("Failed to copy to clipboard")
    );
  };

  if (!scope) {
    return (
      <div className="page page-empty">
        <p>Select a scope to view CLAUDE.md.</p>
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
      </div>

      <p className="page-description">
        Project instructions that Claude Code reads at the start of every
        session. CLAUDE.md is version-controlled — edit it in your code editor
        alongside your source code.
      </p>

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : (
        <>
          {isEmpty && (
            <div className="claude-md-empty">
              <h3>No CLAUDE.md Found</h3>
              <p>
                CLAUDE.md is the most important Claude Code config file — it tells
                Claude how to work in your project. The best way to create one is
                to have Claude Code generate it by analyzing your actual codebase.
              </p>
              <div className="claude-md-prompt-section">
                <h4>Prompt for Claude Code</h4>
                <pre className="prompt-preview">{CLAUDE_MD_PROMPT}</pre>
                <div className="form-actions" style={{ marginTop: 12 }}>
                  <button className="btn btn-primary" onClick={handleCopyPrompt}>
                    Copy Prompt
                  </button>
                </div>
                <p className="text-muted" style={{ marginTop: 8, fontSize: 12 }}>
                  Paste this into Claude Code in your project directory. It will
                  analyze your codebase and create a tailored CLAUDE.md.
                </p>
              </div>
            </div>
          )}

          {!isEmpty && (
            <div className="claude-md-editor-layout">
              <div className="claude-md-preview">
                <MarkdownPreview content={content} />
              </div>
            </div>
          )}

          {/* Markdown references (@file.md) */}
          {mdRefs.length > 0 && (
            <div className="claude-md-references" style={{ marginTop: 24 }}>
              <h3>Referenced Files</h3>
              <p className="text-muted">
                Files included via <code>@file.md</code> references in CLAUDE.md:
              </p>
              <ul className="nested-file-list">
                {mdRefs.map((ref_) => (
                  <li key={ref_.filePath}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: ref_.exists ? "pointer" : "default",
                      }}
                      onClick={() =>
                        ref_.exists &&
                        setExpandedRef(
                          expandedRef === ref_.filePath ? null : ref_.filePath
                        )
                      }
                    >
                      <code>{ref_.reference}</code>
                      {ref_.exists ? (
                        <span
                          className="badge badge-success"
                          style={{ fontSize: 11 }}
                        >
                          found
                        </span>
                      ) : (
                        <span
                          className="badge badge-warning"
                          style={{ fontSize: 11 }}
                        >
                          missing
                        </span>
                      )}
                    </div>
                    {ref_.exists &&
                      ref_.content &&
                      expandedRef === ref_.filePath && (
                        <div style={{ marginTop: 8 }}>
                          <MarkdownPreview content={ref_.content} />
                        </div>
                      )}
                  </li>
                ))}
              </ul>
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
                  Switch to Global Settings to view
                </span>
              </div>
              <pre className="prompt-preview" style={{ maxHeight: 200 }}>
                {globalContent}
              </pre>
            </div>
          )}
        </>
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
