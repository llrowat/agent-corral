use chrono::Utc;
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

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

    // Open log file
    let mut log_file = fs::File::create(&log_path).expect("Failed to create log file");

    // Determine shell and command
    let (shell, shell_arg) = if cfg!(target_os = "windows") {
        ("cmd", "/c")
    } else {
        ("sh", "-c")
    };

    // Spawn the child process
    let child_result = Command::new(shell)
        .arg(shell_arg)
        .arg(&command_str)
        .current_dir(repo_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    let mut child = match child_result {
        Ok(child) => child,
        Err(e) => {
            let error_msg = format!("Failed to spawn command: {}\n", e);
            eprint!("{}", error_msg);
            let _ = log_file.write_all(error_msg.as_bytes());

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

    // Tee stdout
    let stdout = child.stdout.take();
    let log_path_clone = log_path.clone();
    let stdout_handle = std::thread::spawn(move || {
        if let Some(stdout) = stdout {
            let reader = BufReader::new(stdout);
            let mut log = fs::OpenOptions::new()
                .append(true)
                .open(&log_path_clone)
                .expect("Failed to open log for stdout");

            for line in reader.lines() {
                if let Ok(line) = line {
                    println!("{}", line);
                    let _ = writeln!(log, "{}", line);
                }
            }
        }
    });

    // Tee stderr
    let stderr = child.stderr.take();
    let log_path_clone2 = log_path.clone();
    let stderr_handle = std::thread::spawn(move || {
        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            let mut log = fs::OpenOptions::new()
                .append(true)
                .open(&log_path_clone2)
                .expect("Failed to open log for stderr");

            for line in reader.lines() {
                if let Ok(line) = line {
                    eprintln!("{}", line);
                    let _ = writeln!(log, "[stderr] {}", line);
                }
            }
        }
    });

    // Wait for process and threads
    let status = child.wait().expect("Failed to wait for child process");
    let _ = stdout_handle.join();
    let _ = stderr_handle.join();

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
