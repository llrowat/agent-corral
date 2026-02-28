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
    /// Launch a command directly in the system's terminal.
    /// Returns the PID of the spawned process.
    pub fn launch(
        repo_path: &str,
        command: &str,
        terminal_preference: Option<&str>,
    ) -> Result<u32, LaunchError> {
        #[cfg(target_os = "macos")]
        {
            return Self::launch_macos(repo_path, command, terminal_preference);
        }

        #[cfg(target_os = "linux")]
        {
            return Self::launch_linux(repo_path, command, terminal_preference);
        }

        #[cfg(target_os = "windows")]
        {
            return Self::launch_windows(repo_path, command, terminal_preference);
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            return Err(LaunchError::UnsupportedPlatform);
        }
    }

    #[cfg(target_os = "macos")]
    fn launch_macos(
        repo_path: &str,
        command: &str,
        terminal_preference: Option<&str>,
    ) -> Result<u32, LaunchError> {
        let child = match terminal_preference {
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
                    })?
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
                    })?
            }
        };
        Ok(child.id())
    }

    #[cfg(target_os = "linux")]
    fn launch_linux(
        repo_path: &str,
        command: &str,
        terminal_preference: Option<&str>,
    ) -> Result<u32, LaunchError> {
        let keep_open = format!("{}; exec bash", command);
        let cd_keep_open = format!(
            "cd {} && {}; exec bash",
            shell_quote(repo_path),
            command
        );

        if let Some(pref) = terminal_preference {
            let child = match pref {
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
            }
            .map_err(|e| {
                LaunchError::LaunchFailed(format!("Failed to launch {}: {}", pref, e))
            })?;
            return Ok(child.id());
        }

        let terminals = [
            ("gnome-terminal", vec!["--working-directory", repo_path, "--", "bash", "-c", &keep_open as &str]),
            ("konsole", vec!["--workdir", repo_path, "-e", "bash", "-c", &keep_open]),
            ("xterm", vec!["-e", "bash", "-c", &cd_keep_open]),
        ];

        for (term, args) in &terminals {
            if let Ok(child) = Command::new(term).args(args).spawn() {
                return Ok(child.id());
            }
        }

        let child = Command::new("bash")
            .arg("-c")
            .arg(&cd_keep_open)
            .spawn()
            .map_err(|e| LaunchError::LaunchFailed(format!("No terminal emulator found: {}", e)))?;

        Ok(child.id())
    }

    #[cfg(target_os = "windows")]
    fn launch_windows(
        repo_path: &str,
        command: &str,
        _terminal_preference: Option<&str>,
    ) -> Result<u32, LaunchError> {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x00000010;

        let child = Command::new("cmd")
            .args(["/k", command])
            .current_dir(repo_path)
            .creation_flags(CREATE_NEW_CONSOLE)
            .spawn()
            .map_err(|e| {
                LaunchError::LaunchFailed(format!("Failed to launch terminal: {}", e))
            })?;

        Ok(child.id())
    }
}

fn shell_quote(s: &str) -> String {
    if cfg!(target_os = "windows") {
        if s.contains(' ') || s.contains('"') || s.contains('&') || s.contains('^') {
            format!("\"{}\"", s.replace('"', "\\\""))
        } else {
            s.to_string()
        }
    } else {
        if s.contains(' ') || s.contains('"') || s.contains('\'') {
            format!("'{}'", s.replace('\'', "'\\''"))
        } else {
            s.to_string()
        }
    }
}
