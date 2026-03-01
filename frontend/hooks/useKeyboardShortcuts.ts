import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Don't trigger shortcuts when typing in inputs/textareas
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        // Allow Cmd+S to still work in editors
        if (mod && e.key === "s") {
          // Don't prevent — let the save bar handle it
          return;
        }
        return;
      }

      // Cmd/Ctrl+K is handled by GlobalSearch component
      // These are navigation shortcuts

      if (mod && e.key === "1") {
        e.preventDefault();
        navigate("/overview");
      } else if (mod && e.key === "2") {
        e.preventDefault();
        navigate("/claude-md");
      } else if (mod && e.key === "3") {
        e.preventDefault();
        navigate("/config");
      } else if (mod && e.key === "4") {
        e.preventDefault();
        navigate("/agents");
      } else if (mod && e.key === "5") {
        e.preventDefault();
        navigate("/hooks");
      } else if (mod && e.key === "6") {
        e.preventDefault();
        navigate("/skills");
      } else if (mod && e.key === "7") {
        e.preventDefault();
        navigate("/mcp");
      } else if (mod && e.key === "8") {
        e.preventDefault();
        navigate("/memory");
      } else if (mod && e.key === "9") {
        e.preventDefault();
        navigate("/plugins");
      }
    },
    [navigate]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

export const SHORTCUT_LIST: { keys: string; description: string }[] = [
  { keys: "\u2318/Ctrl+K", description: "Open search" },
  { keys: "\u2318/Ctrl+1", description: "Go to Overview" },
  { keys: "\u2318/Ctrl+2", description: "Go to CLAUDE.md" },
  { keys: "\u2318/Ctrl+3", description: "Go to Config" },
  { keys: "\u2318/Ctrl+4", description: "Go to Agents" },
  { keys: "\u2318/Ctrl+5", description: "Go to Hooks" },
  { keys: "\u2318/Ctrl+6", description: "Go to Skills" },
  { keys: "\u2318/Ctrl+7", description: "Go to MCP Servers" },
  { keys: "\u2318/Ctrl+8", description: "Go to Memory" },
  { keys: "\u2318/Ctrl+9", description: "Go to Plugins" },
  { keys: "Esc", description: "Close modal/search" },
];
