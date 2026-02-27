use std::process::Command;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum LaunchError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Unsupported platform")]
    UnsupportedPlatform,
    #[error("Terminal launch failed: {0}")]
    LaunchFailed(String),
}

pub struct TerminalLauncher;

impl TerminalLauncher {
    /// Launch a command in the system's default terminal.
    /// The command is wrapped with the agentcorral-bridge for session tracking.
    pub fn launch(
        repo_path: &str,
        session_id: &str,
        command_name: &str,
        command: &str,
        log_dir: &str,
        bridge_path: &str,
    ) -> Result<(), LaunchError> {
        let bridge_cmd = format!(
            "{} run --session {} --repo {} --name {} --logdir {} -- {}",
            shell_quote(bridge_path),
            shell_quote(session_id),
            shell_quote(repo_path),
            shell_quote(command_name),
            shell_quote(log_dir),
            command
        );

        #[cfg(target_os = "macos")]
        {
            Self::launch_macos(repo_path, &bridge_cmd)?;
        }

        #[cfg(target_os = "linux")]
        {
            Self::launch_linux(repo_path, &bridge_cmd)?;
        }

        #[cfg(target_os = "windows")]
        {
            Self::launch_windows(repo_path, &bridge_cmd)?;
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            return Err(LaunchError::UnsupportedPlatform);
        }

        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn launch_macos(repo_path: &str, command: &str) -> Result<(), LaunchError> {
        let script = format!(
            r#"tell application "Terminal"
    activate
    do script "cd {} && {}"
end tell"#,
            shell_quote(repo_path),
            command.replace('"', r#"\""#)
        );

        Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .spawn()
            .map_err(|e| LaunchError::LaunchFailed(format!("osascript failed: {}", e)))?;

        Ok(())
    }

    #[cfg(target_os = "linux")]
    fn launch_linux(repo_path: &str, command: &str) -> Result<(), LaunchError> {
        // Try common terminal emulators in order
        let terminals = [
            ("gnome-terminal", vec!["--working-directory", repo_path, "--", "bash", "-c", command]),
            ("konsole", vec!["--workdir", repo_path, "-e", "bash", "-c", command]),
            ("xterm", vec!["-e", &format!("cd {} && {}", shell_quote(repo_path), command)]),
        ];

        for (term, args) in &terminals {
            if let Ok(_) = Command::new(term).args(args).spawn() {
                return Ok(());
            }
        }

        // Fallback: try xdg-terminal-exec (freedesktop standard)
        Command::new("bash")
            .arg("-c")
            .arg(format!("cd {} && {}", shell_quote(repo_path), command))
            .spawn()
            .map_err(|e| LaunchError::LaunchFailed(format!("No terminal emulator found: {}", e)))?;

        Ok(())
    }

    #[cfg(target_os = "windows")]
    fn launch_windows(repo_path: &str, command: &str) -> Result<(), LaunchError> {
        // Try Windows Terminal first, fall back to cmd
        let wt_result = Command::new("wt.exe")
            .arg("new-tab")
            .arg("--startingDirectory")
            .arg(repo_path)
            .arg("cmd")
            .arg("/c")
            .arg(command)
            .spawn();

        match wt_result {
            Ok(_) => Ok(()),
            Err(_) => {
                Command::new("cmd")
                    .arg("/c")
                    .arg(format!("start cmd /k \"cd /d {} && {}\"", repo_path, command))
                    .spawn()
                    .map_err(|e| {
                        LaunchError::LaunchFailed(format!("Failed to launch terminal: {}", e))
                    })?;
                Ok(())
            }
        }
    }
}

fn shell_quote(s: &str) -> String {
    if s.contains(' ') || s.contains('"') || s.contains('\'') {
        format!("'{}'", s.replace('\'', "'\\''"))
    } else {
        s.to_string()
    }
}
