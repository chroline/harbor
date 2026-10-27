use crate::acp::Sink;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde_json::json;
use std::{
    io::{Read, Write},
    sync::{Arc, Mutex},
};
pub struct NativeTerminal {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    pub alive: Arc<std::sync::atomic::AtomicBool>,
    output: Arc<Mutex<(u64, Vec<u8>)>>,
    pid: Option<u32>,
    cwd: String,
    command: String,
}
impl NativeTerminal {
    pub fn start(
        command: &str,
        args: &[String],
        cwd: &str,
        sink: Sink,
    ) -> Result<Arc<Self>, String> {
        let system = native_pty_system();
        let pair = system
            .openpty(PtySize {
                rows: 30,
                cols: 100,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        let mut cmd = CommandBuilder::new(command);
        cmd.args(args);
        cmd.cwd(cwd);
        cmd.env("TERM", "xterm-256color");
        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        let pid = child.process_id();
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let alive = Arc::new(std::sync::atomic::AtomicBool::new(true));
        let done = alive.clone();
        let output = Arc::new(Mutex::new((0u64, Vec::<u8>::new())));
        let buffer = output.clone();
        std::thread::spawn(move || {
            let mut buf = [0; 8192];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let end = {
                    let mut b = buffer.lock().unwrap();
                    b.0 += n as u64;
                    b.1.extend_from_slice(&buf[..n]);
                    if b.1.len() > 2_097_152 {
                        let excess = b.1.len() - 2_097_152;
                        b.1.drain(..excess);
                    }
                    b.0
                };
                sink("terminal/data", json!({"bytes":&buf[..n],"end":end}));
            }
            done.store(false, std::sync::atomic::Ordering::SeqCst);
            sink("terminal/exit", json!({}));
        });
        Ok(Arc::new(Self {
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            child: Mutex::new(child),
            alive,
            output,
            pid,
            cwd: cwd.into(),
            command: command.into(),
        }))
    }
    pub fn start_shell(cwd: &str, sink: Sink) -> Result<Arc<Self>, String> {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        Self::start(&shell, &["-l".into(), "-i".into()], cwd, sink)
    }
    #[cfg(unix)]
    fn foreground_group(&self) -> Option<i32> {
        self.master
            .lock()
            .ok()?
            .process_group_leader()
            .filter(|pid| *pid > 0)
    }
    pub fn status(&self) -> serde_json::Value {
        let alive = self.alive.load(std::sync::atomic::Ordering::SeqCst);
        #[cfg(unix)]
        let foreground = self.foreground_group().map(|pid| pid as u32);
        #[cfg(not(unix))]
        let foreground = self.pid;
        let (cwd, command) = foreground
            .and_then(process_context)
            .or_else(|| self.pid.and_then(process_context))
            .unwrap_or_else(|| (self.cwd.clone(), self.command.clone()));
        let folder = std::path::Path::new(&cwd)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(&cwd);
        let program = std::path::Path::new(&command)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(&command);
        let title = format!(
            "{folder} — {}{}",
            program.trim_start_matches('-'),
            if alive { "" } else { " (exited)" }
        );
        json!({"title":title,"alive":alive,"cwd":cwd})
    }
    pub fn snapshot(&self) -> serde_json::Value {
        let b = self.output.lock().unwrap();
        json!({"bytes":b.1,"end":b.0})
    }
    pub fn write(&self, data: &str) -> Result<(), String> {
        let mut w = self.writer.lock().map_err(|e| e.to_string())?;
        w.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        w.flush().map_err(|e| e.to_string())
    }
    pub fn resize(&self, rows: u16, cols: u16) -> Result<(), String> {
        self.master
            .lock()
            .map_err(|e| e.to_string())?
            .resize(PtySize {
                rows: rows.max(1),
                cols: cols.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    }
    pub fn stop(&self) {
        #[cfg(unix)]
        if let Some(group) = self.foreground_group() {
            unsafe {
                libc::kill(-group, libc::SIGTERM);
            }
        }
        if let Ok(mut child) = self.child.lock() {
            #[cfg(unix)]
            if let Some(pid) = child.process_id() {
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGTERM);
                }
            }
            let until = std::time::Instant::now() + std::time::Duration::from_millis(750);
            while std::time::Instant::now() < until {
                if child.try_wait().ok().flatten().is_some() {
                    self.alive.store(false, std::sync::atomic::Ordering::SeqCst);
                    return;
                }
                std::thread::sleep(std::time::Duration::from_millis(25));
            }
            let _ = child.kill();
            let _ = child.wait();
        }
        self.alive.store(false, std::sync::atomic::Ordering::SeqCst);
    }
}

// Read the PTY's foreground process directly, so plain shells get useful titles
// without modifying the user's prompt or shell startup files.
#[cfg(target_os = "macos")]
fn process_context(pid: u32) -> Option<(String, String)> {
    unsafe {
        let mut paths: libc::proc_vnodepathinfo = std::mem::zeroed();
        let mut info: libc::proc_bsdinfo = std::mem::zeroed();
        if libc::proc_pidinfo(
            pid as i32,
            libc::PROC_PIDVNODEPATHINFO,
            0,
            &mut paths as *mut _ as *mut _,
            std::mem::size_of_val(&paths) as i32,
        ) != std::mem::size_of_val(&paths) as i32
            || libc::proc_pidinfo(
                pid as i32,
                libc::PROC_PIDTBSDINFO,
                0,
                &mut info as *mut _ as *mut _,
                std::mem::size_of_val(&info) as i32,
            ) != std::mem::size_of_val(&info) as i32
        {
            return None;
        }
        let text = |bytes: &[libc::c_char]| {
            String::from_utf8_lossy(
                &bytes
                    .iter()
                    .take_while(|b| **b != 0)
                    .map(|b| *b as u8)
                    .collect::<Vec<_>>(),
            )
            .into_owned()
        };
        let path: Vec<_> = paths.pvi_cdir.vip_path.iter().flatten().copied().collect();
        let name = text(&info.pbi_name);
        Some((
            text(&path),
            if name.is_empty() {
                text(&info.pbi_comm)
            } else {
                name
            },
        ))
    }
}
#[cfg(target_os = "linux")]
fn process_context(pid: u32) -> Option<(String, String)> {
    Some((
        std::fs::read_link(format!("/proc/{pid}/cwd"))
            .ok()?
            .to_string_lossy()
            .into_owned(),
        std::fs::read_to_string(format!("/proc/{pid}/comm"))
            .ok()?
            .trim()
            .into(),
    ))
}
#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn process_context(_: u32) -> Option<(String, String)> {
    None
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "macos")]
    #[test]
    fn shell_titles_follow_directory_and_foreground_job_and_tabs_are_independent() {
        let cwd = tempfile::tempdir().unwrap();
        let folder = cwd.path().join("changed-folder");
        std::fs::create_dir(&folder).unwrap();
        let start = || {
            NativeTerminal::start(
                "/bin/zsh",
                &["-f".into(), "-i".into()],
                cwd.path().to_str().unwrap(),
                Arc::new(|_, _| {}),
            )
            .unwrap()
        };
        let first = start();
        let second = start();
        let wait_for = |check: &dyn Fn() -> bool| {
            let until = std::time::Instant::now() + std::time::Duration::from_secs(5);
            while !check() && std::time::Instant::now() < until {
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            assert!(check());
        };
        wait_for(&|| first.status()["title"].as_str().unwrap().ends_with("— zsh"));
        first.write("cd changed-folder\r").unwrap();
        wait_for(&|| first.status()["title"] == "changed-folder — zsh");
        assert!(!second.status()["title"]
            .as_str()
            .unwrap()
            .contains("changed-folder"));
        first.write("/bin/sleep 30\r").unwrap();
        wait_for(&|| first.status()["title"] == "changed-folder — sleep");
        let foreground = first.foreground_group().unwrap();
        first.write("\u{3}").unwrap();
        wait_for(&|| first.status()["title"] == "changed-folder — zsh");
        first.write("/bin/sleep 30\r").unwrap();
        wait_for(&|| first.status()["title"] == "changed-folder — sleep");
        let closing_job = first.foreground_group().unwrap();
        first.stop();
        assert_eq!(first.status()["alive"], false);
        wait_for(&|| unsafe { libc::kill(closing_job, 0) } == -1);
        wait_for(&|| unsafe { libc::kill(foreground, 0) } == -1);
        assert_eq!(second.status()["alive"], true);
        second.write("exit\r").unwrap();
        wait_for(&|| second.status()["alive"] == false);
        second.stop();
    }
    #[test]
    fn terminal_output_is_bounded_and_process_is_reaped() {
        let term = NativeTerminal::start(
            "/usr/bin/python3",
            &[
                "-c".into(),
                "import sys; sys.stdout.write('x' * 3000000)".into(),
            ],
            "/tmp",
            Arc::new(|_, _| {}),
        )
        .unwrap();
        let until = std::time::Instant::now() + std::time::Duration::from_secs(10);
        while term.alive.load(std::sync::atomic::Ordering::SeqCst)
            && std::time::Instant::now() < until
        {
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let snapshot = term.snapshot();
        assert_eq!(snapshot["end"], 3_000_000);
        assert_eq!(snapshot["bytes"].as_array().unwrap().len(), 2_097_152);
        term.stop();
        assert!(!term.alive.load(std::sync::atomic::Ordering::SeqCst));
    }
}
impl Drop for NativeTerminal {
    fn drop(&mut self) {
        self.stop();
    }
}
