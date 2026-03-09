import { useState, useCallback, useRef, useEffect } from "react";
import type { Scope } from "@/types";
import * as api from "@/lib/tauri";

interface Props {
  scope: Scope | null;
  homePath?: string | null;
}

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 300_000; // 5 minutes

type PageState = "intro" | "gathering" | "waiting" | "done" | "error";

function buildPersonalizePrompt(historySummary: string): string {
  return [
    "Analyze the following Claude Code conversation history summary and create personalized agents and skills based on the user's actual usage patterns.",
    "",
    historySummary,
    "",
    "Based on this history, create personalized agents and/or skills that match the user's workflow.",
    "",
    "Instructions for creating agents:",
    "1. Create the .claude/agents/ directory if it doesn't exist.",
    '2. Create markdown files at .claude/agents/<slug-id>.md with YAML frontmatter and system prompt body. Use descriptive slug IDs (lowercase, hyphens only, e.g. "my-debugger").',
    "3. The file must have YAML frontmatter delimited by --- lines at the top, followed by the system prompt in markdown. Example structure:",
    "   ---",
    '   name: "Agent Display Name"',
    '   description: "Brief description of what the agent does"',
    '   tools: "Read, Write, Edit, Bash, Glob, Grep"',
    "   ---",
    "",
    "   System prompt instructions go here...",
    "",
    "4. The tools field is a comma-separated string. Choose from: Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, TodoWrite, NotebookEdit, Agent, CronCreate, CronList, CronDelete. Omit the tools field entirely to grant access to all tools.",
    "5. The model field is optional. Valid values: sonnet, opus, haiku. Omit to use the default model.",
    "6. Do NOT create .meta.json sidecar files.",
    "",
    "Instructions for creating skills:",
    "1. Create the .claude/skills/ directory if it doesn't exist.",
    "2. Create skill directories at .claude/skills/<slug-id>/ with a SKILL.md file inside each. Use descriptive slug IDs.",
    "3. The SKILL.md file must have YAML frontmatter delimited by --- lines at the top, followed by the skill content in markdown. Example structure:",
    "   ---",
    '   name: "Skill Display Name"',
    '   description: "Brief description of what the skill does"',
    "   user_invocable: true",
    "   allowed_tools:",
    "     - Read",
    "     - Write",
    "     - Edit",
    "     - Bash",
    "     - Glob",
    "     - Grep",
    "   ---",
    "",
    "   Skill instructions go here in markdown...",
    "",
    "4. Available tools: Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, TodoWrite, NotebookEdit, Task, CronCreate, CronList, CronDelete.",
    "",
    "Guidelines:",
    "- Create 2-4 agents that reflect the user's most common work patterns",
    "- Create 1-3 skills for their most frequent workflows",
    "- Make system prompts detailed, specific, and tailored to the patterns you see in the history",
    "- Reference specific tools the user frequently uses",
    "- Name agents and skills to reflect their actual purpose (not generic names like 'personalized-debugger')",
    "- Each agent should have a focused, distinct purpose",
  ].join("\n");
}

export function PersonalizePage({ scope, homePath }: Props) {
  const [state, setState] = useState<PageState>("intro");
  const [errorMsg, setErrorMsg] = useState("");
  const pidRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Personalize always operates at global scope
  const basePath = homePath ?? (scope?.type === "global" ? scope.homePath : null);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const handlePersonalize = useCallback(async () => {
    if (!basePath) return;

    setState("gathering");
    try {
      // Step 1: Gather history summary from backend
      const summary = await api.getHistorySummary();

      // Step 2: Build prompt for Claude Code
      const prompt = buildPersonalizePrompt(summary);

      // Step 3: Launch Claude Code in terminal
      const command = await api.prepareAiCommand(basePath, prompt);
      const pid = await api.launchTerminal(basePath, command);
      pidRef.current = pid;
      setState("waiting");

      // Poll process state until it exits
      pollRef.current = setInterval(async () => {
        if (pidRef.current === null) return;
        try {
          const alive = await api.isProcessAlive(pidRef.current);
          if (!alive) {
            cleanup();
            setState("done");
            window.dispatchEvent(new CustomEvent("sidebar-refresh"));
          }
        } catch {
          // polling error, keep trying
        }
      }, POLL_INTERVAL_MS);

      // Timeout after 5 minutes
      timeoutRef.current = setTimeout(() => {
        cleanup();
        setState("done");
        window.dispatchEvent(new CustomEvent("sidebar-refresh"));
      }, TIMEOUT_MS);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      setState("error");
    }
  }, [basePath, cleanup]);

  return (
    <div className="page personalize-page">
      <div className="page-header">
        <h2>Personalize from History</h2>
        <p className="page-description">
          Generate custom agents and skills based on how you actually use Claude
          Code.
        </p>
      </div>

      {state === "intro" && (
        <div className="personalize-intro">
          <div className="personalize-intro-card">
            <h3>How it works</h3>
            <p className="text-muted" style={{ marginBottom: 12 }}>
              Every time you send a prompt in Claude Code, it gets saved to a
              history file at <code>~/.claude/history.jsonl</code>. This
              feature reads that file and looks for patterns in how you
              work — the types of tasks you run most often, the projects you
              work on, and your common workflows — then generates agents and
              skills tailored to you.
            </p>
            <ol>
              <li>
                Reads your prompt history from{" "}
                <code>~/.claude/history.jsonl</code> and builds a summary of
                your most common usage patterns
              </li>
              <li>
                Launches Claude Code in a terminal to analyze those patterns
                and create matching agents and skills
              </li>
              <li>
                New agents and skills are written directly to your global{" "}
                <code>~/.claude/</code> directory, ready to use
              </li>
            </ol>
            <p className="text-muted" style={{ marginTop: 12 }}>
              A terminal window will open where Claude Code will work. You can
              watch and interact with it.
            </p>
            <button
              className="btn btn-primary"
              onClick={handlePersonalize}
              disabled={!basePath}
            >
              Personalize with AI
            </button>
          </div>
        </div>
      )}

      {state === "gathering" && (
        <div className="personalize-loading">
          <div className="spinner" />
          <p>Gathering conversation history...</p>
        </div>
      )}

      {state === "waiting" && (
        <div className="personalize-waiting">
          <div className="ai-create-progress">
            <div className="ai-create-spinner" />
            <span>Running</span>
          </div>
          <p className="text-muted" style={{ marginTop: 16 }}>
            Claude Code is analyzing your history and creating personalized
            agents and skills in a terminal window. This page will update
            automatically when the process finishes.
          </p>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button
              className="btn"
              onClick={() => {
                cleanup();
                setState("done");
                window.dispatchEvent(new CustomEvent("sidebar-refresh"));
              }}
            >
              Close &amp; Continue
            </button>
          </div>
        </div>
      )}

      {state === "done" && (
        <div className="personalize-done">
          <h3>Complete</h3>
          <p className="text-muted" style={{ marginBottom: 16 }}>
            Claude Code has finished creating personalized agents and skills.
            Check the Agents and Skills pages to see your new configurations.
          </p>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={() => setState("intro")}
            >
              Run Again
            </button>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="personalize-error">
          <p>{errorMsg}</p>
          <button className="btn btn-secondary" onClick={() => setState("intro")}>
            Back
          </button>
        </div>
      )}
    </div>
  );
}
