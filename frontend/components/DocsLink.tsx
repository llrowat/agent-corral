const DOCS_URLS: Record<string, string> = {
  agents: "https://docs.anthropic.com/en/docs/claude-code/sub-agents",
  hooks: "https://docs.anthropic.com/en/docs/claude-code/hooks",
  skills: "https://docs.anthropic.com/en/docs/claude-code/slash-commands",
  mcp: "https://docs.anthropic.com/en/docs/claude-code/mcp",
  settings: "https://docs.anthropic.com/en/docs/claude-code/settings",
  memory: "https://docs.anthropic.com/en/docs/claude-code/memory",
};

interface DocsLinkProps {
  page: keyof typeof DOCS_URLS;
}

export function DocsLink({ page }: DocsLinkProps) {
  const url = DOCS_URLS[page];
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="docs-link"
    >
      Docs
    </a>
  );
}
