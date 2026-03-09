use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::claude_adapter::{Agent, Skill};

/// Represents a single message in a Claude Code JSONL conversation
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConversationMessage {
    #[serde(rename = "type")]
    msg_type: Option<String>,
    role: Option<String>,
    message: Option<MessageContent>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessageContent {
    role: Option<String>,
    content: Option<serde_json::Value>,
}

/// Aggregated analysis of user's conversation history
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryAnalysis {
    /// Total number of conversations found
    pub conversation_count: usize,
    /// Total number of user messages analyzed
    pub message_count: usize,
    /// Top tools used across conversations (tool name -> count)
    pub tool_usage: Vec<ToolUsageEntry>,
    /// Detected topic categories with frequency
    pub topic_categories: Vec<TopicCategory>,
    /// Suggested agents based on patterns
    pub suggested_agents: Vec<Agent>,
    /// Suggested skills based on patterns
    pub suggested_skills: Vec<Skill>,
    /// Common prompt patterns detected
    pub prompt_patterns: Vec<PromptPattern>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolUsageEntry {
    pub tool: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopicCategory {
    pub category: String,
    pub count: usize,
    pub keywords: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptPattern {
    pub pattern: String,
    pub description: String,
    pub frequency: usize,
}

/// Category detection keywords
struct CategoryDef {
    name: &'static str,
    keywords: &'static [&'static str],
}

const CATEGORIES: &[CategoryDef] = &[
    CategoryDef {
        name: "Bug Fixing",
        keywords: &["bug", "fix", "error", "broken", "crash", "exception", "fail", "issue", "debug", "wrong"],
    },
    CategoryDef {
        name: "Testing",
        keywords: &["test", "spec", "coverage", "assert", "mock", "stub", "unit test", "integration test", "e2e"],
    },
    CategoryDef {
        name: "Refactoring",
        keywords: &["refactor", "clean up", "simplify", "extract", "rename", "restructure", "reorganize", "improve"],
    },
    CategoryDef {
        name: "New Features",
        keywords: &["add", "create", "implement", "build", "new feature", "integrate", "introduce"],
    },
    CategoryDef {
        name: "Documentation",
        keywords: &["document", "readme", "comment", "jsdoc", "docstring", "explain", "docs"],
    },
    CategoryDef {
        name: "Code Review",
        keywords: &["review", "check", "audit", "inspect", "look at", "examine", "analyze"],
    },
    CategoryDef {
        name: "Performance",
        keywords: &["performance", "optimize", "slow", "fast", "speed", "cache", "memory", "benchmark", "profile"],
    },
    CategoryDef {
        name: "DevOps & CI",
        keywords: &["deploy", "ci", "cd", "docker", "pipeline", "build", "release", "github action", "workflow"],
    },
    CategoryDef {
        name: "Database",
        keywords: &["database", "query", "sql", "migration", "schema", "table", "index", "orm"],
    },
    CategoryDef {
        name: "API Development",
        keywords: &["api", "endpoint", "rest", "graphql", "route", "handler", "middleware", "request", "response"],
    },
    CategoryDef {
        name: "Frontend/UI",
        keywords: &["component", "ui", "css", "style", "layout", "render", "react", "vue", "html", "page"],
    },
    CategoryDef {
        name: "Security",
        keywords: &["security", "auth", "authentication", "authorization", "permission", "encrypt", "token", "credential"],
    },
    CategoryDef {
        name: "Git Operations",
        keywords: &["commit", "branch", "merge", "rebase", "push", "pull", "git", "pr", "pull request"],
    },
    CategoryDef {
        name: "Configuration",
        keywords: &["config", "setup", "install", "configure", "env", "settings", "environment"],
    },
];

/// Pattern detection rules
struct PatternDef {
    name: &'static str,
    description: &'static str,
    keywords: &'static [&'static str],
}

const PATTERNS: &[PatternDef] = &[
    PatternDef {
        name: "Fix and Test",
        description: "Frequently fixes bugs and asks for tests to verify",
        keywords: &["fix", "test"],
    },
    PatternDef {
        name: "Explain then Implement",
        description: "Often asks for explanation before making changes",
        keywords: &["explain", "implement"],
    },
    PatternDef {
        name: "Review and Refactor",
        description: "Regularly reviews code and then refactors it",
        keywords: &["review", "refactor"],
    },
    PatternDef {
        name: "Create with Tests",
        description: "Creates new features with accompanying tests",
        keywords: &["create", "test"],
    },
    PatternDef {
        name: "Debug Workflow",
        description: "Follows a systematic debugging approach",
        keywords: &["debug", "log", "error"],
    },
    PatternDef {
        name: "Documentation First",
        description: "Prioritizes documentation alongside code changes",
        keywords: &["doc", "readme", "comment"],
    },
];

/// Find all Claude Code project directories that contain JSONL conversations.
/// Claude Code stores conversations at ~/.claude/projects/<hash>/
pub fn find_conversation_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(home) = dirs::home_dir() {
        let projects_dir = home.join(".claude").join("projects");
        if projects_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(&projects_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        // Check if this directory has any .jsonl files
                        if let Ok(files) = fs::read_dir(&path) {
                            let has_jsonl = files
                                .flatten()
                                .any(|f| {
                                    f.path()
                                        .extension()
                                        .map_or(false, |ext| ext == "jsonl")
                                });
                            if has_jsonl {
                                dirs.push(path);
                            }
                        }
                    }
                }
            }
        }
    }

    dirs
}

/// Find all JSONL files within conversation directories
fn find_jsonl_files(dirs: &[PathBuf]) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for dir in dirs {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "jsonl") {
                    files.push(path);
                }
            }
        }
    }
    files
}

/// Extract user messages from a JSONL file
fn extract_user_messages(path: &Path) -> Vec<String> {
    let mut messages = Vec::new();
    if let Ok(content) = fs::read_to_string(path) {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Ok(msg) = serde_json::from_str::<ConversationMessage>(line) {
                // Check for human/user role
                let is_user = msg.role.as_deref() == Some("human")
                    || msg.role.as_deref() == Some("user")
                    || msg.msg_type.as_deref() == Some("human");

                // Also check nested message content
                let is_nested_user = msg
                    .message
                    .as_ref()
                    .and_then(|m| m.role.as_deref())
                    .map_or(false, |r| r == "human" || r == "user");

                if is_user || is_nested_user {
                    // Extract text content
                    if let Some(message) = &msg.message {
                        if let Some(content) = &message.content {
                            match content {
                                serde_json::Value::String(s) => {
                                    if !s.trim().is_empty() {
                                        messages.push(s.clone());
                                    }
                                }
                                serde_json::Value::Array(arr) => {
                                    for item in arr {
                                        if let Some(text) = item
                                            .as_object()
                                            .and_then(|o| o.get("text"))
                                            .and_then(|t| t.as_str())
                                        {
                                            if !text.trim().is_empty() {
                                                messages.push(text.to_string());
                                            }
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }
    messages
}

/// Extract tool usage from a JSONL file (from assistant messages)
fn extract_tool_usage(path: &Path) -> HashMap<String, usize> {
    let mut tools: HashMap<String, usize> = HashMap::new();
    if let Ok(content) = fs::read_to_string(path) {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
                // Look for tool_use blocks in assistant messages
                if let Some(message) = val.get("message") {
                    if let Some(content) = message.get("content") {
                        if let Some(arr) = content.as_array() {
                            for item in arr {
                                if item.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                                    if let Some(name) = item.get("name").and_then(|n| n.as_str()) {
                                        *tools.entry(name.to_string()).or_insert(0) += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    tools
}

/// Classify user messages into topic categories
fn classify_messages(messages: &[String]) -> Vec<TopicCategory> {
    let mut category_counts: HashMap<String, (usize, Vec<String>)> = HashMap::new();

    for msg in messages {
        let lower = msg.to_lowercase();
        for cat in CATEGORIES {
            let matched_keywords: Vec<String> = cat
                .keywords
                .iter()
                .filter(|kw| lower.contains(*kw))
                .map(|s| s.to_string())
                .collect();

            if !matched_keywords.is_empty() {
                let entry = category_counts
                    .entry(cat.name.to_string())
                    .or_insert_with(|| (0, Vec::new()));
                entry.0 += 1;
                for kw in matched_keywords {
                    if !entry.1.contains(&kw) {
                        entry.1.push(kw);
                    }
                }
            }
        }
    }

    let mut categories: Vec<TopicCategory> = category_counts
        .into_iter()
        .map(|(name, (count, keywords))| TopicCategory {
            category: name,
            count,
            keywords,
        })
        .collect();

    categories.sort_by(|a, b| b.count.cmp(&a.count));
    categories
}

/// Detect common prompt patterns
fn detect_patterns(messages: &[String]) -> Vec<PromptPattern> {
    let mut patterns = Vec::new();

    for pattern_def in PATTERNS {
        let count = messages
            .iter()
            .filter(|msg| {
                let lower = msg.to_lowercase();
                pattern_def
                    .keywords
                    .iter()
                    .all(|kw| lower.contains(kw))
            })
            .count();

        if count > 0 {
            patterns.push(PromptPattern {
                pattern: pattern_def.name.to_string(),
                description: pattern_def.description.to_string(),
                frequency: count,
            });
        }
    }

    patterns.sort_by(|a, b| b.frequency.cmp(&a.frequency));
    patterns
}

/// Generate suggested agents based on analysis results
fn generate_agent_suggestions(
    categories: &[TopicCategory],
    tool_usage: &[(String, usize)],
) -> Vec<Agent> {
    let mut agents = Vec::new();

    // Determine the top tools to assign to agents
    let top_tools: Vec<String> = tool_usage
        .iter()
        .take(8)
        .map(|(name, _)| name.clone())
        .collect();

    // Determine read-only vs read-write tool sets
    let read_tools = vec!["Read".to_string(), "Glob".to_string(), "Grep".to_string()];
    let write_tools = vec![
        "Read".to_string(),
        "Write".to_string(),
        "Edit".to_string(),
        "Glob".to_string(),
        "Grep".to_string(),
        "Bash".to_string(),
    ];

    for cat in categories.iter().take(5) {
        let (agent_id, name, description, system_prompt, tools) = match cat.category.as_str() {
            "Bug Fixing" => (
                "personalized-debugger",
                "Personalized Debugger",
                "A debugger tailored to your frequent bug-fixing patterns",
                format!(
                    "You are a debugging specialist customized for this user's workflow. \
                    Based on their history, they frequently work on: {}.\n\n\
                    When given a bug report or error:\n\
                    1. Reproduce the issue by reading the relevant code\n\
                    2. Search for related patterns using the user's common keywords: {}\n\
                    3. Identify the root cause, not just the symptom\n\
                    4. Apply a minimal, targeted fix\n\
                    5. Suggest a test to prevent regression\n\n\
                    Be concise and specific. Reference file paths and line numbers.",
                    categories_summary(categories),
                    cat.keywords.join(", ")
                ),
                if top_tools.contains(&"Bash".to_string()) {
                    write_tools.clone()
                } else {
                    read_tools.clone()
                },
            ),
            "Testing" => (
                "personalized-tester",
                "Personalized Test Writer",
                "A test specialist tuned to your testing habits",
                format!(
                    "You are a test-writing specialist customized for this user. \
                    Based on their history, their most common project areas are: {}.\n\n\
                    When writing tests:\n\
                    1. Examine the project's existing test patterns and frameworks\n\
                    2. Write tests matching the project's conventions\n\
                    3. Cover edge cases the user commonly encounters: {}\n\
                    4. Use descriptive test names\n\
                    5. Run tests to verify they pass",
                    categories_summary(categories),
                    cat.keywords.join(", ")
                ),
                write_tools.clone(),
            ),
            "Refactoring" => (
                "personalized-refactorer",
                "Personalized Refactorer",
                "A refactoring agent tuned to your code improvement style",
                format!(
                    "You are a refactoring specialist customized for this user's preferences. \
                    Their common focus areas include: {}.\n\n\
                    When refactoring:\n\
                    1. Understand the full context before changing anything\n\
                    2. Make incremental improvements aligned with the user's style\n\
                    3. Focus on the areas they care about most: {}\n\
                    4. Preserve existing behavior — verify with tests\n\
                    5. Keep changes minimal and reviewable",
                    categories_summary(categories),
                    cat.keywords.join(", ")
                ),
                write_tools.clone(),
            ),
            "New Features" => (
                "personalized-builder",
                "Personalized Feature Builder",
                "A feature builder that matches your development patterns",
                format!(
                    "You are a feature-building specialist customized for this user's workflow. \
                    They typically work on: {}.\n\n\
                    When building new features:\n\
                    1. Understand the existing architecture before adding code\n\
                    2. Follow the project's established patterns and conventions\n\
                    3. Build incrementally with the user's preferred approach\n\
                    4. Include tests for new functionality\n\
                    5. Keep the implementation focused and minimal",
                    categories_summary(categories)
                ),
                write_tools.clone(),
            ),
            "Documentation" => (
                "personalized-documenter",
                "Personalized Documenter",
                "A documentation agent tuned to your documentation style",
                format!(
                    "You are a documentation specialist customized for this user. \
                    Their common project areas include: {}.\n\n\
                    When writing documentation:\n\
                    1. Read the code thoroughly to understand purpose and behavior\n\
                    2. Write clear docs that explain the \"why\" not just the \"what\"\n\
                    3. Match the project's existing documentation style\n\
                    4. Include examples where helpful\n\
                    5. Focus on: {}",
                    categories_summary(categories),
                    cat.keywords.join(", ")
                ),
                vec![
                    "Read".to_string(),
                    "Write".to_string(),
                    "Edit".to_string(),
                    "Glob".to_string(),
                    "Grep".to_string(),
                ],
            ),
            "Code Review" => (
                "personalized-reviewer",
                "Personalized Code Reviewer",
                "A reviewer that focuses on the issues you care about most",
                format!(
                    "You are a code reviewer customized for this user's priorities. \
                    Their focus areas include: {}.\n\n\
                    When reviewing code:\n\
                    1. Check for the types of issues this user commonly encounters\n\
                    2. Focus especially on: {}\n\
                    3. Be specific with file paths and line numbers\n\
                    4. Suggest concrete fixes\n\
                    5. Prioritize by severity (critical > major > minor)",
                    categories_summary(categories),
                    cat.keywords.join(", ")
                ),
                read_tools.clone(),
            ),
            "Performance" => (
                "personalized-optimizer",
                "Personalized Performance Optimizer",
                "A performance specialist tuned to your optimization patterns",
                format!(
                    "You are a performance specialist customized for this user. \
                    They work on: {}.\n\n\
                    When optimizing:\n\
                    1. Profile and measure before changing anything\n\
                    2. Focus on the biggest bottlenecks first\n\
                    3. Apply patterns relevant to: {}\n\
                    4. Verify improvements with benchmarks\n\
                    5. Avoid premature optimization",
                    categories_summary(categories),
                    cat.keywords.join(", ")
                ),
                write_tools.clone(),
            ),
            "Security" => (
                "personalized-security",
                "Personalized Security Auditor",
                "A security reviewer that focuses on your project's risk areas",
                format!(
                    "You are a security specialist customized for this user's projects. \
                    Their typical work involves: {}.\n\n\
                    When auditing security:\n\
                    1. Check for OWASP top 10 vulnerabilities\n\
                    2. Focus on: {}\n\
                    3. Verify authentication and authorization flows\n\
                    4. Check for secrets/credentials in code\n\
                    5. Suggest concrete fixes with severity ratings",
                    categories_summary(categories),
                    cat.keywords.join(", ")
                ),
                read_tools.clone(),
            ),
            _ => continue,
        };

        agents.push(Agent {
            agent_id: agent_id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            system_prompt,
            tools,
            model_override: None,
            memory: None,
            color: None,
            source: Some("personalized".to_string()),
            read_only: None,
        });
    }

    // If no specific category agents were generated, create a general-purpose one
    if agents.is_empty() {
        agents.push(Agent {
            agent_id: "personalized-assistant".to_string(),
            name: "Personalized Assistant".to_string(),
            description: "A general-purpose assistant based on your usage history".to_string(),
            system_prompt: format!(
                "You are a personalized coding assistant. Based on this user's conversation history, \
                they most commonly use these tools: {}.\n\n\
                Adapt to their workflow:\n\
                1. Be concise and action-oriented\n\
                2. Focus on practical solutions\n\
                3. Follow the project's existing patterns\n\
                4. Suggest tests when making changes\n\
                5. Reference file paths and line numbers",
                tool_usage
                    .iter()
                    .take(5)
                    .map(|(name, count)| format!("{} ({}x)", name, count))
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            tools: if top_tools.is_empty() {
                write_tools
            } else {
                top_tools.into_iter().take(6).collect()
            },
            model_override: None,
            memory: None,
            color: None,
            source: Some("personalized".to_string()),
            read_only: None,
        });
    }

    agents
}

/// Generate suggested skills based on analysis results
fn generate_skill_suggestions(
    categories: &[TopicCategory],
    patterns: &[PromptPattern],
) -> Vec<Skill> {
    let mut skills = Vec::new();

    // Generate skills from top patterns
    for pattern in patterns.iter().take(3) {
        let (skill_id, name, description, content, tools) = match pattern.pattern.as_str() {
            "Fix and Test" => (
                "fix-and-test",
                "Fix and Test",
                "Fix the issue and generate a test to prevent regression",
                "Fix the described issue and write a test to prevent it from recurring.\n\n\
                1. Identify the root cause of the bug\n\
                2. Apply a minimal fix\n\
                3. Write a test that would have caught the bug\n\
                4. Run the test suite to verify nothing is broken\n\
                5. Summarize what was fixed and how the test prevents regression",
                vec!["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
            ),
            "Explain then Implement" => (
                "explain-and-implement",
                "Explain and Implement",
                "First explain the approach, then implement the change",
                "First explain the approach, then implement the requested change.\n\n\
                1. Analyze the codebase to understand the current state\n\
                2. Explain the proposed approach and any trade-offs\n\
                3. Implement the change step by step\n\
                4. Verify the implementation works correctly\n\
                5. Summarize what was done",
                vec!["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
            ),
            "Review and Refactor" => (
                "review-and-refactor",
                "Review and Refactor",
                "Review code quality and apply targeted refactoring",
                "Review the specified code and apply targeted improvements.\n\n\
                1. Analyze the code for quality issues\n\
                2. Identify the most impactful improvements\n\
                3. Apply refactoring changes\n\
                4. Verify behavior is preserved with tests\n\
                5. Summarize the improvements made",
                vec!["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
            ),
            "Create with Tests" => (
                "create-with-tests",
                "Create with Tests",
                "Build new functionality with comprehensive tests",
                "Create the requested feature with comprehensive tests.\n\n\
                1. Understand the requirements\n\
                2. Design the implementation approach\n\
                3. Implement the feature\n\
                4. Write thorough tests (happy path + edge cases)\n\
                5. Run tests and verify everything works",
                vec!["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
            ),
            "Debug Workflow" => (
                "systematic-debug",
                "Systematic Debug",
                "Follow a systematic debugging workflow",
                "Debug the issue using a systematic approach.\n\n\
                1. Reproduce the issue by understanding expected vs actual behavior\n\
                2. Add strategic logging or breakpoints to narrow the scope\n\
                3. Identify the root cause\n\
                4. Apply a minimal fix\n\
                5. Verify the fix and remove debug artifacts",
                vec!["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
            ),
            "Documentation First" => (
                "document-first",
                "Document First",
                "Document the code before or alongside changes",
                "Document the specified code or changes.\n\n\
                1. Read the code to understand its purpose\n\
                2. Write or update documentation\n\
                3. Add inline comments for complex logic\n\
                4. Update README or other docs if needed\n\
                5. Ensure documentation matches current behavior",
                vec!["Read", "Write", "Edit", "Glob", "Grep"],
            ),
            _ => continue,
        };

        skills.push(Skill {
            skill_id: skill_id.to_string(),
            name: name.to_string(),
            description: Some(description.to_string()),
            user_invocable: Some(true),
            allowed_tools: tools.into_iter().map(|s| s.to_string()).collect(),
            model: None,
            disable_model_invocation: None,
            context: None,
            agent: None,
            argument_hint: None,
            content: content.to_string(),
            source: Some("personalized".to_string()),
            read_only: None,
        });
    }

    // Generate category-based skills for top categories not already covered by patterns
    for cat in categories.iter().take(3) {
        let skill_id = format!("personalized-{}", cat.category.to_lowercase().replace(' ', "-").replace('/', "-"));
        // Skip if we already have a skill that covers this
        if skills.iter().any(|s| s.skill_id == skill_id) {
            continue;
        }

        let name = format!("{} Assistant", cat.category);
        let description = format!(
            "Personalized skill for {} tasks (used {} times in history)",
            cat.category, cat.count
        );
        let content = format!(
            "Help with {} tasks.\n\n\
            Common keywords from your history: {}\n\n\
            1. Understand the current context\n\
            2. Apply best practices for {}\n\
            3. Make changes aligned with the project's conventions\n\
            4. Verify the result\n\
            5. Summarize what was done",
            cat.category,
            cat.keywords.join(", "),
            cat.category
        );

        skills.push(Skill {
            skill_id,
            name,
            description: Some(description),
            user_invocable: Some(true),
            allowed_tools: vec![
                "Read".to_string(),
                "Write".to_string(),
                "Edit".to_string(),
                "Glob".to_string(),
                "Grep".to_string(),
                "Bash".to_string(),
            ],
            model: None,
            disable_model_invocation: None,
            context: None,
            agent: None,
            argument_hint: None,
            content,
            source: Some("personalized".to_string()),
            read_only: None,
        });
    }

    skills
}

fn categories_summary(categories: &[TopicCategory]) -> String {
    categories
        .iter()
        .take(3)
        .map(|c| format!("{} ({}x)", c.category, c.count))
        .collect::<Vec<_>>()
        .join(", ")
}

/// Analyze all Claude Code conversation history and generate personalized suggestions.
pub fn analyze_history() -> Result<HistoryAnalysis, String> {
    let conv_dirs = find_conversation_dirs();
    if conv_dirs.is_empty() {
        return Err("No Claude Code conversation history found at ~/.claude/projects/. Use Claude Code in some projects first to build up history.".to_string());
    }

    let jsonl_files = find_jsonl_files(&conv_dirs);
    if jsonl_files.is_empty() {
        return Err("No conversation files found in Claude Code history directories.".to_string());
    }

    // Extract all user messages and tool usage
    let mut all_messages: Vec<String> = Vec::new();
    let mut all_tool_usage: HashMap<String, usize> = HashMap::new();

    for file in &jsonl_files {
        let messages = extract_user_messages(file);
        all_messages.extend(messages);

        let tools = extract_tool_usage(file);
        for (tool, count) in tools {
            *all_tool_usage.entry(tool).or_insert(0) += count;
        }
    }

    // Sort tool usage by frequency
    let mut tool_usage: Vec<(String, usize)> = all_tool_usage.into_iter().collect();
    tool_usage.sort_by(|a, b| b.1.cmp(&a.1));

    let tool_usage_entries: Vec<ToolUsageEntry> = tool_usage
        .iter()
        .map(|(tool, count)| ToolUsageEntry {
            tool: tool.clone(),
            count: *count,
        })
        .collect();

    // Classify messages
    let categories = classify_messages(&all_messages);

    // Detect patterns
    let patterns = detect_patterns(&all_messages);

    // Generate suggestions
    let suggested_agents = generate_agent_suggestions(&categories, &tool_usage);
    let suggested_skills = generate_skill_suggestions(&categories, &patterns);

    Ok(HistoryAnalysis {
        conversation_count: conv_dirs.len(),
        message_count: all_messages.len(),
        tool_usage: tool_usage_entries,
        topic_categories: categories,
        suggested_agents,
        suggested_skills,
        prompt_patterns: patterns,
    })
}

/// A single entry from ~/.claude/history.jsonl
#[derive(Debug, Deserialize)]
struct HistoryEntry {
    display: String,
    #[serde(default)]
    project: Option<String>,
}

/// Collect a text summary of the user's prompt history for Claude Code to analyze.
/// Reads from ~/.claude/history.jsonl which stores every prompt the user has sent.
pub fn get_history_summary_text() -> Result<String, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;
    let history_path = home.join(".claude").join("history.jsonl");

    if !history_path.exists() {
        return Err(
            "No Claude Code prompt history found at ~/.claude/history.jsonl. \
             Use Claude Code first to build up history."
                .to_string(),
        );
    }

    let content = fs::read_to_string(&history_path)
        .map_err(|e| format!("Failed to read history.jsonl: {}", e))?;

    let mut prompts: Vec<String> = Vec::new();
    let mut projects: HashMap<String, usize> = HashMap::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(entry) = serde_json::from_str::<HistoryEntry>(line) {
            let display = entry.display.trim().to_string();
            if display.len() >= 5 {
                prompts.push(display);
            }
            if let Some(proj) = entry.project {
                if let Some(name) = Path::new(&proj).file_name().and_then(|n| n.to_str()) {
                    *projects.entry(name.to_string()).or_insert(0) += 1;
                }
            }
        }
    }

    if prompts.is_empty() {
        return Err("No prompts found in ~/.claude/history.jsonl.".to_string());
    }

    // Build formatted summary
    let mut summary = String::new();

    summary.push_str(&format!(
        "## Prompt History Summary\n\n\
        - Total prompts: {}\n\
        - Projects used: {}\n\n",
        prompts.len(),
        projects.len()
    ));

    // Project breakdown
    if !projects.is_empty() {
        let mut proj_list: Vec<(String, usize)> = projects.into_iter().collect();
        proj_list.sort_by(|a, b| b.1.cmp(&a.1));

        summary.push_str("### Projects (by prompt count)\n\n");
        for (name, count) in proj_list.iter().take(20) {
            summary.push_str(&format!("- {}: {} prompts\n", name, count));
        }
        summary.push('\n');
    }

    // Sample prompts — take a representative spread, cap at 80
    summary.push_str("### Sample Prompts (representative selection)\n\n");
    let step = std::cmp::max(1, prompts.len() / 80);
    let mut sample_count = 0;
    for (i, prompt) in prompts.iter().enumerate() {
        if i % step != 0 {
            continue;
        }
        let truncated = if prompt.len() > 200 {
            format!("{}...", &prompt[..200])
        } else {
            prompt.clone()
        };
        summary.push_str(&format!("- {}\n", truncated));
        sample_count += 1;
        if sample_count >= 80 {
            break;
        }
    }
    summary.push('\n');

    Ok(summary)
}

/// Analyze history for a specific project path (only conversations from that project)
pub fn analyze_project_history(project_path: &str) -> Result<HistoryAnalysis, String> {
    // Claude Code hashes the project path for directory names, but we can also
    // check all projects and find matching ones by scanning
    let analysis = analyze_history()?;
    // For now, return the global analysis (project-specific filtering could be added
    // by matching directory hashes to project paths)
    Ok(analysis)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn classify_messages_detects_categories() {
        let messages = vec![
            "fix the bug in the login handler".to_string(),
            "write a test for the user service".to_string(),
            "refactor the database module".to_string(),
            "add a new feature for notifications".to_string(),
            "fix this error message crash".to_string(),
        ];

        let categories = classify_messages(&messages);
        assert!(!categories.is_empty());

        // Bug fixing should be detected
        let bug_cat = categories.iter().find(|c| c.category == "Bug Fixing");
        assert!(bug_cat.is_some());
        assert!(bug_cat.unwrap().count >= 2);

        // Testing should be detected
        let test_cat = categories.iter().find(|c| c.category == "Testing");
        assert!(test_cat.is_some());
    }

    #[test]
    fn detect_patterns_finds_fix_and_test() {
        let messages = vec![
            "fix the bug and test it".to_string(),
            "fix this issue, then add a test".to_string(),
            "just fix it".to_string(),
        ];

        let patterns = detect_patterns(&messages);
        let fix_test = patterns.iter().find(|p| p.pattern == "Fix and Test");
        assert!(fix_test.is_some());
        assert_eq!(fix_test.unwrap().frequency, 2);
    }

    #[test]
    fn detect_patterns_handles_empty_input() {
        let patterns = detect_patterns(&[]);
        assert!(patterns.is_empty());
    }

    #[test]
    fn classify_messages_handles_empty_input() {
        let categories = classify_messages(&[]);
        assert!(categories.is_empty());
    }

    #[test]
    fn generate_agent_suggestions_creates_agents() {
        let categories = vec![
            TopicCategory {
                category: "Bug Fixing".to_string(),
                count: 10,
                keywords: vec!["fix".to_string(), "bug".to_string()],
            },
            TopicCategory {
                category: "Testing".to_string(),
                count: 5,
                keywords: vec!["test".to_string()],
            },
        ];
        let tool_usage = vec![
            ("Read".to_string(), 100),
            ("Edit".to_string(), 50),
            ("Bash".to_string(), 30),
        ];

        let agents = generate_agent_suggestions(&categories, &tool_usage);
        assert!(!agents.is_empty());
        assert!(agents.iter().any(|a| a.agent_id == "personalized-debugger"));
        assert!(agents.iter().any(|a| a.agent_id == "personalized-tester"));
    }

    #[test]
    fn generate_agent_suggestions_handles_empty_categories() {
        let agents = generate_agent_suggestions(&[], &[]);
        assert!(!agents.is_empty()); // Should produce fallback agent
        assert!(agents.iter().any(|a| a.agent_id == "personalized-assistant"));
    }

    #[test]
    fn generate_skill_suggestions_creates_skills() {
        let categories = vec![TopicCategory {
            category: "Bug Fixing".to_string(),
            count: 10,
            keywords: vec!["fix".to_string(), "bug".to_string()],
        }];
        let patterns = vec![PromptPattern {
            pattern: "Fix and Test".to_string(),
            description: "desc".to_string(),
            frequency: 5,
        }];

        let skills = generate_skill_suggestions(&categories, &patterns);
        assert!(!skills.is_empty());
        assert!(skills.iter().any(|s| s.skill_id == "fix-and-test"));
    }

    #[test]
    fn generate_skill_suggestions_handles_empty_input() {
        let skills = generate_skill_suggestions(&[], &[]);
        assert!(skills.is_empty());
    }

    #[test]
    fn extract_user_messages_from_jsonl() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.jsonl");
        let mut file = fs::File::create(&file_path).unwrap();

        // Write test JSONL lines
        writeln!(
            file,
            r#"{{"type":"human","message":{{"role":"human","content":"fix the login bug"}}}}"#
        )
        .unwrap();
        writeln!(
            file,
            r#"{{"type":"assistant","message":{{"role":"assistant","content":"I'll fix that"}}}}"#
        )
        .unwrap();
        writeln!(
            file,
            r#"{{"type":"human","message":{{"role":"human","content":"now add a test"}}}}"#
        )
        .unwrap();

        let messages = extract_user_messages(&file_path);
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0], "fix the login bug");
        assert_eq!(messages[1], "now add a test");
    }

    #[test]
    fn extract_tool_usage_from_jsonl() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.jsonl");
        let mut file = fs::File::create(&file_path).unwrap();

        writeln!(
            file,
            r#"{{"type":"assistant","message":{{"role":"assistant","content":[{{"type":"tool_use","name":"Read","input":{{}}}},{{"type":"tool_use","name":"Edit","input":{{}}}}]}}}}"#
        )
        .unwrap();
        writeln!(
            file,
            r#"{{"type":"assistant","message":{{"role":"assistant","content":[{{"type":"tool_use","name":"Read","input":{{}}}}]}}}}"#
        )
        .unwrap();

        let tools = extract_tool_usage(&file_path);
        assert_eq!(*tools.get("Read").unwrap(), 2);
        assert_eq!(*tools.get("Edit").unwrap(), 1);
    }

    #[test]
    fn extract_user_messages_handles_array_content() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.jsonl");
        let mut file = fs::File::create(&file_path).unwrap();

        writeln!(
            file,
            r#"{{"type":"human","message":{{"role":"human","content":[{{"type":"text","text":"hello world"}}]}}}}"#
        )
        .unwrap();

        let messages = extract_user_messages(&file_path);
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0], "hello world");
    }

    #[test]
    fn categories_summary_formats_correctly() {
        let categories = vec![
            TopicCategory {
                category: "Bug Fixing".to_string(),
                count: 10,
                keywords: vec![],
            },
            TopicCategory {
                category: "Testing".to_string(),
                count: 5,
                keywords: vec![],
            },
        ];
        let summary = categories_summary(&categories);
        assert_eq!(summary, "Bug Fixing (10x), Testing (5x)");
    }
}
