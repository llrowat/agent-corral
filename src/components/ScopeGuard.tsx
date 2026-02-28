import type { Scope } from "@/types";

interface ScopeBannerProps {
  scope: Scope;
}

export function ScopeBanner({ scope }: ScopeBannerProps) {
  if (scope.type !== "global") return null;

  return (
    <div className="scope-banner scope-banner-warning">
      <span className="scope-banner-icon">&#9670;</span>
      <span>
        <strong>Global Scope</strong> — Changes here affect all projects on
        this machine.
      </span>
    </div>
  );
}

interface McpFileIndicatorProps {
  scope: Scope;
}

export function McpFileIndicator({ scope }: McpFileIndicatorProps) {
  const isGlobal = scope.type === "global";
  const filePath = isGlobal ? "~/.claude.json" : ".mcp.json";

  return (
    <span className="mcp-file-indicator">
      Editing <code>{filePath}</code>
    </span>
  );
}

interface CopyToScopeProps {
  label: string;
  onClick: () => void;
}

export function CopyToScopeButton({ label, onClick }: CopyToScopeProps) {
  return (
    <button className="btn btn-sm copy-to-scope-btn" onClick={onClick} title={label}>
      {label}
    </button>
  );
}
