use chrono::Utc;
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Parser)]
#[command(name = "agentcorral-bridge")]
#[command(about = "AgentCorral Bridge CLI - session envelope and process management")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run a command with session tracking
    Run {
        /// Session ID
        #[arg(long)]
        session: String,

        /// Repository path
        #[arg(long)]
        repo: String,

        /// Human-readable command name
        #[arg(long)]
        name: String,

        /// Directory for session logs and envelopes
        #[arg(long)]
        logdir: String,

        /// The command to execute (everything after --)
        #[arg(last = true, required = true)]
        command: Vec<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionEnvelope {
    session_id: String,
    repo_path: String,
    command_name: String,
    command: String,
    started_at: String,
    ended_at: Option<String>,
    status: String,
    exit_code: Option<i32>,
    log_path: String,
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Run {
            session,
            repo,
            name,
            logdir,
            command,
        } => {
            let exit_code = run_session(&session, &repo, &name, &logdir, &command);
            std::process::exit(exit_code);
        }
    }
}

fn run_session(
    session_id: &str,
    repo_path: &str,
    command_name: &str,
    logdir: &str,
    command_parts: &[String],
) -> i32 {
    let logdir = PathBuf::from(logdir);
    fs::create_dir_all(&logdir).expect("Failed to create log directory");

    let envelope_path = logdir.join(format!("{}.json", session_id));
    let log_path = logdir.join(format!("{}.log", session_id));
    let command_str = command_parts.join(" ");

    // Write initial envelope (status=running)
    let envelope = SessionEnvelope {
        session_id: session_id.to_string(),
        repo_path: repo_path.to_string(),
        command_name: command_name.to_string(),
        command: command_str.clone(),
        started_at: Utc::now().to_rfc3339(),
        ended_at: None,
        status: "running".to_string(),
        exit_code: None,
        log_path: log_path.to_string_lossy().to_string(),
    };
    atomic_write_json(&envelope_path, &envelope);

    // Create an empty log file for bookkeeping
    let _ = fs::File::create(&log_path);

    // Determine shell and command
    let (shell, shell_arg) = if cfg!(target_os = "windows") {
        ("cmd", "/c")
    } else {
        ("sh", "-c")
    };

    // Spawn the child process with inherited stdio so interactive TUI apps
    // (like Claude Code) get direct terminal access.
    let child_result = Command::new(shell)
        .arg(shell_arg)
        .arg(&command_str)
        .current_dir(repo_path)
        .spawn();

    let mut child = match child_result {
        Ok(child) => child,
        Err(e) => {
            let error_msg = format!("Failed to spawn command: {}\n", e);
            eprint!("{}", error_msg);
            if let Ok(mut log_file) = fs::File::create(&log_path) {
                let _ = log_file.write_all(error_msg.as_bytes());
            }

            let final_envelope = SessionEnvelope {
                ended_at: Some(Utc::now().to_rfc3339()),
                status: "failed".to_string(),
                exit_code: Some(1),
                ..envelope
            };
            atomic_write_json(&envelope_path, &final_envelope);
            return 1;
        }
    };

    // Wait for process to finish
    let status = child.wait().expect("Failed to wait for child process");

    let exit_code = status.code().unwrap_or(1);
    let final_status = if exit_code == 0 { "success" } else { "failed" };

    // Update envelope with final status
    let final_envelope = SessionEnvelope {
        ended_at: Some(Utc::now().to_rfc3339()),
        status: final_status.to_string(),
        exit_code: Some(exit_code),
        ..envelope
    };
    atomic_write_json(&envelope_path, &final_envelope);

    exit_code
}

fn atomic_write_json<T: Serialize>(path: &Path, value: &T) {
    let json = serde_json::to_string_pretty(value).expect("Failed to serialize JSON");
    let temp_path = path.with_extension("tmp");
    fs::write(&temp_path, &json).expect("Failed to write temp file");
    fs::rename(&temp_path, path).expect("Failed to rename temp file");
}
