import { useState, useEffect } from "react";
import { SHORTCUT_LIST } from "@/hooks/useKeyboardShortcuts";

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Open on "?" key (Shift+/ on most keyboards), but not when typing
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    const openFromButton = () => setOpen(true);
    window.addEventListener("keydown", handler);
    window.addEventListener("open-shortcuts", openFromButton);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("open-shortcuts", openFromButton);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="shortcuts-overlay" onClick={() => setOpen(false)}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h2>Keyboard Shortcuts</h2>
          <kbd className="search-kbd">ESC</kbd>
        </div>
        <div className="shortcuts-list">
          {SHORTCUT_LIST.map((shortcut) => (
            <div key={shortcut.keys} className="shortcuts-row">
              <span className="shortcuts-desc">{shortcut.description}</span>
              <kbd className="shortcuts-keys">{shortcut.keys}</kbd>
            </div>
          ))}
          <div className="shortcuts-row">
            <span className="shortcuts-desc">Show keyboard shortcuts</span>
            <kbd className="shortcuts-keys">?</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
