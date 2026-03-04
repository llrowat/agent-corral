import type { Agent, HookEvent, Skill, McpServer, NormalizedConfig } from "@/types";

// -- Agent Presets --

export interface AgentPreset {
  id: string;
  label: string;
  description: string;
  agent: Agent;
}

export const AGENT_PRESETS: AgentPreset[] = [
  {
    id: "code-reviewer",
    label: "Code Reviewer",
    description: "Reviews code for bugs, security issues, and best practices",
    agent: {
      agentId: "code-reviewer",
      name: "Code Reviewer",
      description: "Reviews code for bugs, security issues, and best practices",
      systemPrompt:
        "You are a thorough code reviewer. When given code to review:\n\n1. Check for bugs, logic errors, and edge cases\n2. Identify security vulnerabilities (injection, XSS, auth issues)\n3. Suggest performance improvements\n4. Flag code style inconsistencies\n5. Verify error handling is adequate\n\nBe specific: reference line numbers, suggest concrete fixes, and explain why each issue matters. Prioritize issues by severity (critical > major > minor).",
      tools: ["Read", "Glob", "Grep"],
      modelOverride: null,
      memory: null,
    },
  },
  {
    id: "test-writer",
    label: "Test Writer",
    description: "Generates unit and integration tests for your code",
    agent: {
      agentId: "test-writer",
      name: "Test Writer",
      description: "Generates unit and integration tests for your code",
      systemPrompt:
        "You are a test-writing specialist. When asked to write tests:\n\n1. Read the source code to understand the function/module behavior\n2. Identify edge cases, error paths, and boundary conditions\n3. Write tests using the project's existing test framework and conventions\n4. Include both happy-path and failure-case tests\n5. Use descriptive test names that explain what is being tested\n\nMatch the project's testing style. Look at existing tests for patterns before writing new ones.",
      tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
      modelOverride: null,
      memory: null,
    },
  },
  {
    id: "doc-writer",
    label: "Documentation Writer",
    description: "Writes clear documentation and inline comments",
    agent: {
      agentId: "doc-writer",
      name: "Documentation Writer",
      description: "Writes clear documentation and inline comments",
      systemPrompt:
        "You are a documentation specialist. When asked to document code:\n\n1. Read the code thoroughly to understand its purpose and behavior\n2. Write clear, concise documentation that explains the \"why\" not just the \"what\"\n3. Include usage examples where helpful\n4. Document parameters, return values, and error conditions\n5. Match the project's existing documentation style\n\nAvoid redundant comments that just restate the code. Focus on non-obvious behavior, design decisions, and integration points.",
      tools: ["Read", "Write", "Edit", "Glob", "Grep"],
      modelOverride: null,
      memory: null,
    },
  },
  {
    id: "refactorer",
    label: "Refactorer",
    description: "Improves code structure without changing behavior",
    agent: {
      agentId: "refactorer",
      name: "Refactorer",
      description: "Improves code structure without changing behavior",
      systemPrompt:
        "You are a code refactoring specialist. When asked to refactor:\n\n1. Understand the existing behavior completely before changing anything\n2. Make small, incremental improvements\n3. Reduce duplication and improve naming\n4. Simplify complex conditionals and nested logic\n5. Ensure no behavioral changes — refactoring must be safe\n\nAlways verify your changes don't break existing tests. If no tests exist for the code being refactored, flag this as a risk.",
      tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
      modelOverride: null,
      memory: null,
    },
  },
  {
    id: "bug-fixer",
    label: "Bug Fixer",
    description: "Diagnoses and fixes bugs from error reports or descriptions",
    agent: {
      agentId: "bug-fixer",
      name: "Bug Fixer",
      description: "Diagnoses and fixes bugs from error reports or descriptions",
      systemPrompt:
        "You are a debugging specialist. When given a bug report:\n\n1. Reproduce: understand the expected vs actual behavior\n2. Locate: search the codebase for the relevant code paths\n3. Diagnose: identify the root cause, not just the symptom\n4. Fix: make the minimal change needed to resolve the issue\n5. Verify: run existing tests and suggest new test cases for the fix\n\nExplain your reasoning at each step. Prefer targeted fixes over broad refactors.",
      tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
      modelOverride: null,
      memory: null,
    },
  },
];

// -- Hook Presets --

export interface HookPreset {
  id: string;
  label: string;
  description: string;
  hookEvent: HookEvent;
}

export const HOOK_PRESETS: HookPreset[] = [
  {
    id: "lint-on-write",
    label: "Lint on Write",
    description: "Runs linter before any file write operations",
    hookEvent: {
      event: "PreToolUse",
      groups: [
        {
          matcher: "Write|Edit",
          hooks: [
            {
              hookType: "command",
              command: "npx eslint --max-warnings 0 .",
              prompt: null,
              timeout: 30,
            },
          ],
        },
      ],
    },
  },
  {
    id: "typecheck-on-write",
    label: "Type Check on Write",
    description: "Runs TypeScript type checker before file writes",
    hookEvent: {
      event: "PreToolUse",
      groups: [
        {
          matcher: "Write|Edit",
          hooks: [
            {
              hookType: "command",
              command: "npx tsc --noEmit",
              prompt: null,
              timeout: 60,
            },
          ],
        },
      ],
    },
  },
  {
    id: "test-on-stop",
    label: "Run Tests on Stop",
    description: "Automatically runs tests when Claude finishes a task",
    hookEvent: {
      event: "Stop",
      groups: [
        {
          matcher: null,
          hooks: [
            {
              hookType: "command",
              command: "npm test",
              prompt: null,
              timeout: 120,
            },
          ],
        },
      ],
    },
  },
  {
    id: "format-on-write",
    label: "Format on Write",
    description: "Auto-formats files with Prettier after writes",
    hookEvent: {
      event: "PostToolUse",
      groups: [
        {
          matcher: "Write|Edit",
          hooks: [
            {
              hookType: "command",
              command: "npx prettier --write .",
              prompt: null,
              timeout: 30,
            },
          ],
        },
      ],
    },
  },
  {
    id: "review-before-bash",
    label: "Review Shell Commands",
    description: "Prompts Claude to double-check before running shell commands",
    hookEvent: {
      event: "PreToolUse",
      groups: [
        {
          matcher: "Bash",
          hooks: [
            {
              hookType: "prompt",
              command: null,
              prompt:
                "Before running this shell command, verify: (1) it won't delete or overwrite important files, (2) it won't make irreversible changes, (3) it's safe to run in the current directory. If unsafe, explain why and suggest a safer alternative.",
              timeout: null,
            },
          ],
        },
      ],
    },
  },
];

// -- Skill Presets --

export interface SkillPreset {
  id: string;
  label: string;
  description: string;
  skill: Skill;
}

export const SKILL_PRESETS: SkillPreset[] = [
  {
    id: "generate-tests",
    label: "Generate Tests",
    description: "Generates unit tests for a given file or function",
    skill: {
      skillId: "generate-tests",
      name: "Generate Tests",
      description: "Generate unit tests for a file or function",
      userInvocable: true,
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
      content:
        "Generate comprehensive unit tests for the specified code.\n\n1. Read the target file and understand its exports and behavior\n2. Look at existing test files for the project's testing conventions\n3. Write tests covering: happy path, edge cases, error handling\n4. Use descriptive test names\n5. Run the tests to make sure they pass",
    },
  },
  {
    id: "explain-code",
    label: "Explain Code",
    description: "Provides a detailed walkthrough of how code works",
    skill: {
      skillId: "explain-code",
      name: "Explain Code",
      description: "Explain how a piece of code works in detail",
      userInvocable: true,
      allowedTools: ["Read", "Glob", "Grep"],
      content:
        "Explain the specified code in detail.\n\n1. Read the target file or function\n2. Describe its purpose at a high level\n3. Walk through the logic step by step\n4. Explain any non-obvious patterns or design decisions\n5. Note any dependencies or side effects\n\nUse clear, simple language suitable for someone learning the codebase.",
    },
  },
  {
    id: "review-pr",
    label: "Review PR",
    description: "Reviews git changes like a pull request reviewer",
    skill: {
      skillId: "review-pr",
      name: "Review PR",
      description: "Review current git changes as a pull request",
      userInvocable: true,
      allowedTools: ["Read", "Glob", "Grep", "Bash"],
      content:
        "Review the current uncommitted or staged changes as if reviewing a pull request.\n\n1. Run `git diff` and `git diff --staged` to see all changes\n2. For each changed file, review for: correctness, security, performance, style\n3. Check that tests are included or updated\n4. Verify no sensitive data (secrets, credentials) is being committed\n5. Provide a summary: approve, request changes, or comment\n\nBe constructive and specific. Reference file names and line numbers.",
    },
  },
  {
    id: "commit",
    label: "Smart Commit",
    description: "Creates a well-formatted commit message from staged changes",
    skill: {
      skillId: "commit",
      name: "Smart Commit",
      description: "Create a descriptive commit from staged changes",
      userInvocable: true,
      allowedTools: ["Bash"],
      content:
        'Create a git commit with a well-written message.\n\n1. Run `git diff --staged` to see what\'s being committed\n2. Analyze the changes to understand the purpose\n3. Write a commit message following conventional commits format:\n   - feat: for new features\n   - fix: for bug fixes\n   - refactor: for restructuring\n   - docs: for documentation\n   - test: for test additions\n4. Keep the subject line under 72 characters\n5. Add a body if the changes need explanation\n6. Run `git commit -m "..."` with the message',
    },
  },
];

// -- MCP Server Presets --

export interface McpPreset {
  id: string;
  label: string;
  description: string;
  server: McpServer;
}

export const MCP_PRESETS: McpPreset[] = [
  {
    id: "filesystem",
    label: "Filesystem",
    description: "Browse and manage files via MCP",
    server: {
      serverId: "filesystem",
      serverType: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      url: null,
      env: null,
      headers: null,
    },
  },
  {
    id: "github",
    label: "GitHub",
    description: "Interact with GitHub repos, issues, and PRs",
    server: {
      serverId: "github",
      serverType: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      url: null,
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: "<your-token-here>" },
      headers: null,
    },
  },
  {
    id: "postgres",
    label: "PostgreSQL",
    description: "Query and inspect a PostgreSQL database",
    server: {
      serverId: "postgres",
      serverType: "stdio",
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://localhost:5432/mydb",
      ],
      url: null,
      env: null,
      headers: null,
    },
  },
  {
    id: "memory",
    label: "Memory",
    description: "Persistent knowledge graph memory for Claude",
    server: {
      serverId: "memory",
      serverType: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      url: null,
      env: null,
      headers: null,
    },
  },
];

// -- Starter Templates (full project bootstraps) --

export interface StarterTemplate {
  id: string;
  label: string;
  description: string;
  config: NormalizedConfig;
  agents: Agent[];
  hooks: HookEvent[];
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "web-app",
    label: "Web App (React / Node)",
    description:
      "Model, ignore patterns, code reviewer agent, lint-on-write hook",
    config: {
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: [
        "node_modules",
        "dist",
        "build",
        ".next",
        "coverage",
        ".env",
        ".env.*",
      ],
      raw: {},
    },
    agents: [AGENT_PRESETS[0].agent, AGENT_PRESETS[1].agent],
    hooks: [HOOK_PRESETS[0].hookEvent],
  },
  {
    id: "python",
    label: "Python / Data Science",
    description:
      "Model, Python ignore patterns, test writer agent, test-on-stop hook",
    config: {
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: [
        "__pycache__",
        "*.pyc",
        ".venv",
        "venv",
        "dist",
        ".eggs",
        "*.egg-info",
        ".env",
      ],
      raw: {},
    },
    agents: [AGENT_PRESETS[1].agent, AGENT_PRESETS[4].agent],
    hooks: [HOOK_PRESETS[2].hookEvent],
  },
  {
    id: "rust",
    label: "Rust CLI / Library",
    description: "Model, Rust ignore patterns, code reviewer, test-on-stop",
    config: {
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: ["target", "Cargo.lock", ".env"],
      raw: {},
    },
    agents: [AGENT_PRESETS[0].agent, AGENT_PRESETS[4].agent],
    hooks: [
      {
        event: "Stop",
        groups: [
          {
            matcher: null,
            hooks: [
              {
                hookType: "command",
                command: "cargo test",
                prompt: null,
                timeout: 120,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "go",
    label: "Go",
    description: "Model, Go ignore patterns, code reviewer, test-on-stop",
    config: {
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: ["vendor", "bin", "*.exe", ".env"],
      raw: {},
    },
    agents: [AGENT_PRESETS[0].agent, AGENT_PRESETS[4].agent],
    hooks: [
      {
        event: "Stop",
        groups: [
          {
            matcher: null,
            hooks: [
              {
                hookType: "command",
                command: "go test ./...",
                prompt: null,
                timeout: 120,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "java",
    label: "Java / Kotlin (Gradle)",
    description: "Model, JVM ignore patterns, code reviewer, test-on-stop",
    config: {
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: ["build", ".gradle", "*.class", "*.jar", ".env", ".idea"],
      raw: {},
    },
    agents: [AGENT_PRESETS[0].agent, AGENT_PRESETS[1].agent],
    hooks: [
      {
        event: "Stop",
        groups: [
          {
            matcher: null,
            hooks: [
              {
                hookType: "command",
                command: "./gradlew test",
                prompt: null,
                timeout: 180,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "dotnet",
    label: "C# / .NET",
    description: "Model, .NET ignore patterns, code reviewer, test-on-stop",
    config: {
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: ["bin", "obj", "*.dll", "*.exe", ".vs", ".env"],
      raw: {},
    },
    agents: [AGENT_PRESETS[0].agent, AGENT_PRESETS[4].agent],
    hooks: [
      {
        event: "Stop",
        groups: [
          {
            matcher: null,
            hooks: [
              {
                hookType: "command",
                command: "dotnet test",
                prompt: null,
                timeout: 180,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "swift",
    label: "Swift / iOS",
    description: "Model, Swift/Xcode ignore patterns, code reviewer",
    config: {
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: [
        ".build",
        "DerivedData",
        "*.xcworkspace",
        "Pods",
        ".env",
      ],
      raw: {},
    },
    agents: [AGENT_PRESETS[0].agent],
    hooks: [],
  },
  {
    id: "ruby",
    label: "Ruby on Rails",
    description: "Model, Ruby ignore patterns, test writer, format-on-write",
    config: {
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: ["vendor/bundle", "tmp", "log", ".env", "coverage", "node_modules"],
      raw: {},
    },
    agents: [AGENT_PRESETS[1].agent, AGENT_PRESETS[4].agent],
    hooks: [
      {
        event: "Stop",
        groups: [
          {
            matcher: null,
            hooks: [
              {
                hookType: "command",
                command: "bundle exec rspec",
                prompt: null,
                timeout: 180,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Just the model and basic ignore patterns — nothing else",
    config: {
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: ["node_modules", ".git", "dist", ".env"],
      raw: {},
    },
    agents: [],
    hooks: [],
  },
];

// -- Slug helper --

export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function suggestSlugFix(input: string): string | null {
  const slug = toSlug(input);
  if (slug && slug !== input) return slug;
  return null;
}
