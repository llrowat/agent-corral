import { useState } from "react";

interface SectionProps {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  /** When true, force the section open (used by search filter). */
  forceOpen?: boolean;
  /** When true, hide this section entirely. */
  hidden?: boolean;
  children: React.ReactNode;
}

export function Section({
  title,
  hint,
  defaultOpen = false,
  forceOpen,
  hidden,
  children,
}: SectionProps) {
  const [userOpen, setUserOpen] = useState(defaultOpen);
  const open = forceOpen ?? userOpen;

  if (hidden) return null;

  return (
    <div className="config-section" data-section={title}>
      <button
        className="config-section-toggle"
        onClick={() => setUserOpen(!open)}
        type="button"
      >
        <span className={`toggle-arrow ${open ? "open" : ""}`}>&#9654;</span>
        <h3>{title}</h3>
        {hint && <span className="config-section-hint">{hint}</span>}
      </button>
      {open && <div className="config-section-body">{children}</div>}
    </div>
  );
}
