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
    /// Launch a command in the system's default terminal or a user-chosen terminal.
    /// The command is wrapped with the agentcorral-bridge for session tracking.
    pub fn launch(
        repo_path: &str,
        session_id: &str,
        command_name: &str,
        command: &str,
        log_dir: &str,
        bridge_path: &str,
        terminal_preference: Option<&str>,
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
            Self::launch_macos(repo_path, &bridge_cmd, terminal_preference)?;
        }

        #[cfg(target_os = "linux")]
        {
            Self::launch_linux(repo_path, &bridge_cmd, terminal_preference)?;
        }

        #[cfg(target_os = "windows")]
        {
            Self::launch_windows(repo_path, &bridge_cmd, terminal_preference)?;
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            return Err(LaunchError::UnsupportedPlatform);
        }

        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn launch_macos(
        repo_path: &str,
        command: &str,
        terminal_preference: Option<&str>,
    ) -> Result<(), LaunchError> {
        match terminal_preference {
            Some("iterm") => {
                let script = format!(
                    r#"tell application "iTerm"
    activate
    set newWindow to (create window with default profile)
    tell current session of newWindow
        write text "cd {} && {}"
    end tell
end tell"#,
                    shell_quote(repo_path),
                    command.replace('"', r#"\""#)
                );
                Command::new("osascript")
                    .arg("-e")
                    .arg(&script)
                    .spawn()
                    .map_err(|e| {
                        LaunchError::LaunchFailed(format!("iTerm2 launch failed: {}", e))
                    })?;
            }
            _ => {
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
                    .map_err(|e| {
                        LaunchError::LaunchFailed(format!("osascript failed: {}", e))
                    })?;
            }
        }
        Ok(())
    }

    #[cfg(target_os = "linux")]
    fn launch_linux(
        repo_path: &str,
        command: &str,
        terminal_preference: Option<&str>,
    ) -> Result<(), LaunchError> {
        // Wrap the command so the shell stays open after it exits.
        // "exec bash" replaces the subshell with an interactive bash.
        let keep_open = format!("{}; exec bash", command);
        let cd_keep_open = format!(
            "cd {} && {}; exec bash",
            shell_quote(repo_path),
            command
        );

        if let Some(pref) = terminal_preference {
            let result = match pref {
                "gnome-terminal" => Command::new("gnome-terminal")
                    .args(["--working-directory", repo_path, "--", "bash", "-c", &keep_open])
                    .spawn(),
                "konsole" => Command::new("konsole")
                    .args(["--workdir", repo_path, "-e", "bash", "-c", &keep_open])
                    .spawn(),
                "xterm" => Command::new("xterm")
                    .args(["-e", "bash", "-c", &cd_keep_open])
                    .spawn(),
                "alacritty" => Command::new("alacritty")
                    .args(["--working-directory", repo_path, "-e", "bash", "-c", &keep_open])
                    .spawn(),
                "kitty" => Command::new("kitty")
                    .args(["--directory", repo_path, "bash", "-c", &keep_open])
                    .spawn(),
                _ => {
                    return Err(LaunchError::LaunchFailed(format!(
                        "Unknown terminal: {}",
                        pref
                    )));
                }
            };
            result.map_err(|e| {
                LaunchError::LaunchFailed(format!("Failed to launch {}: {}", pref, e))
            })?;
            return Ok(());
        }

        // Auto-detect: try common terminal emulators in order
        let terminals = [
            ("gnome-terminal", vec!["--working-directory", repo_path, "--", "bash", "-c", &keep_open as &str]),
            ("konsole", vec!["--workdir", repo_path, "-e", "bash", "-c", &keep_open]),
            ("xterm", vec!["-e", "bash", "-c", &cd_keep_open]),
        ];

        for (term, args) in &terminals {
            if let Ok(_) = Command::new(term).args(args).spawn() {
                return Ok(());
            }
        }

        // Fallback: try xdg-terminal-exec (freedesktop standard)
        Command::new("bash")
            .arg("-c")
            .arg(&cd_keep_open)
            .spawn()
            .map_err(|e| LaunchError::LaunchFailed(format!("No terminal emulator found: {}", e)))?;

        Ok(())
    }

    #[cfg(target_os = "windows")]
    fn launch_windows(
        repo_path: &str,
        command: &str,
        terminal_preference: Option<&str>,
    ) -> Result<(), LaunchError> {
        match terminal_preference {
            Some("cmd") => {
                Command::new("cmd")
                    .arg("/c")
                    .arg(format!("start cmd /k \"cd /d {} && {}\"", repo_path, command))
                    .spawn()
                    .map_err(|e| {
                        LaunchError::LaunchFailed(format!("Failed to launch cmd: {}", e))
                    })?;
            }
            Some("powershell") => {
                Command::new("cmd")
                    .arg("/c")
                    .arg(format!(
                        "start powershell -NoExit -Command \"Set-Location '{}'; {}\"",
                        repo_path, command
                    ))
                    .spawn()
                    .map_err(|e| {
                        LaunchError::LaunchFailed(format!("Failed to launch PowerShell: {}", e))
                    })?;
            }
            Some("git-bash") => {
                // Git Bash: use mintty + bash --login so the terminal stays open.
                // git-bash.exe is a wrapper around mintty; using bash.exe directly
                // with "cmd /c start" and /k keeps the window alive.
                let git_dirs = [
                    "C:\\Program Files\\Git",
                    "C:\\Program Files (x86)\\Git",
                ];
                let mut launched = false;
                for dir in &git_dirs {
                    let bash_exe = format!("{}\\bin\\bash.exe", dir);
                    if std::path::Path::new(&bash_exe).exists() {
                        // Open mintty (Git Bash window) running bash with our command.
                        // Using --hold=error keeps the window open if the command fails,
                        // and bash -l -c "cmd; exec bash -l" keeps it open on success too.
                        let mintty_exe = format!("{}\\usr\\bin\\mintty.exe", dir);
                        let shell_cmd = format!(
                            "cd {} && {}; exec bash -l",
                            shell_quote(repo_path),
                            command
                        );
                        if std::path::Path::new(&mintty_exe).exists() {
                            Command::new(&mintty_exe)
                                .args(["-h", "always", "-e", "/bin/bash", "-l", "-c", &shell_cmd])
                                .spawn()
                                .map_err(|e| {
                                    LaunchError::LaunchFailed(format!(
                                        "Failed to launch Git Bash: {}",
                                        e
                                    ))
                                })?;
                        } else {
                            // Fallback: open bash.exe in a new cmd window
                            Command::new("cmd")
                                .arg("/c")
                                .arg(format!(
                                    "start \"\" \"{}\" -l -c \"cd {} && {}; exec bash -l\"",
                                    bash_exe,
                                    shell_quote(repo_path),
                                    command
                                ))
                                .spawn()
                                .map_err(|e| {
                                    LaunchError::LaunchFailed(format!(
                                        "Failed to launch Git Bash: {}",
                                        e
                                    ))
                                })?;
                        }
                        launched = true;
                        break;
                    }
                }
                if !launched {
                    return Err(LaunchError::LaunchFailed(
                        "Git Bash not found".to_string(),
                    ));
                }
            }
            Some("windows-terminal") | None => {
                // Try Windows Terminal first, fall back to cmd.
                // Use /k so the terminal stays open after the command exits.
                let wt_result = Command::new("wt.exe")
                    .arg("new-tab")
                    .arg("--startingDirectory")
                    .arg(repo_path)
                    .arg("cmd")
                    .arg("/k")
                    .arg(command)
                    .spawn();

                match wt_result {
                    Ok(_) => {}
                    Err(_) => {
                        Command::new("cmd")
                            .arg("/c")
                            .arg(format!(
                                "start cmd /k \"cd /d {} && {}\"",
                                repo_path, command
                            ))
                            .spawn()
                            .map_err(|e| {
                                LaunchError::LaunchFailed(format!(
                                    "Failed to launch terminal: {}",
                                    e
                                ))
                            })?;
                    }
                }
            }
            Some(other) => {
                return Err(LaunchError::LaunchFailed(format!(
                    "Unknown terminal: {}",
                    other
                )));
            }
        }
        Ok(())
    }
}

fn shell_quote(s: &str) -> String {
    if s.contains(' ') || s.contains('"') || s.contains('\'') {
        format!("'{}'", s.replace('\'', "'\\''"))
    } else {
        s.to_string()
    }
}
