use crate::types::*;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, io::Read, path::Path, process::Command};
use walkdir::WalkDir;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub fn run(cwd: &Path, program: &str, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new(program);
    #[cfg(test)]
    if program == "wt" {
        command.arg("--config-set").arg(format!(
            "worktree-path=\"{}/trees/{{{{ branch | sanitize }}}}\"",
            cwd.parent().unwrap().display()
        ));
    }
    let output = command
        .args(args)
        .current_dir(cwd)
        .stdin(std::process::Stdio::null())
        .output()
        .map_err(err)?;
    if !output.status.success() {
        return Err(format!(
            "{program}: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().into())
}
pub fn root(path: &str) -> Result<String, String> {
    probe_root(path, "git", std::time::Duration::from_secs(2))
}
fn probe_root(path: &str, program: &str, timeout: std::time::Duration) -> Result<String, String> {
    let mut child = Command::new(program)
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn().map_err(err)?;
    let deadline = std::time::Instant::now() + timeout;
    loop {
        if child.try_wait().map_err(err)?.is_some() { break; }
        if std::time::Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Git folder inspection timed out".into());
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    let output = child.wait_with_output().map_err(err)?;
    if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).trim().into()); }
    Ok(String::from_utf8_lossy(&output.stdout).trim().into())
}
pub fn branches(repo: &str) -> Result<Vec<String>, String> {
    let output = run(Path::new(repo), "git", &[
        "for-each-ref", "--sort=-committerdate", "--format=%(refname)%09%(symref)",
        "refs/heads", "refs/remotes",
    ])?;
    Ok(output.lines().filter_map(|line| {
        let (name, target) = line.split_once('\t').unwrap_or((line, ""));
        if !target.is_empty() { return None; }
        name.strip_prefix("refs/heads/")
            .or_else(|| name.strip_prefix("refs/remotes/"))
            .map(str::to_owned)
    }).collect())
}
pub fn list(repo: &str) -> Result<Value, String> {
    let raw: Value = serde_json::from_str(&run(Path::new(repo), "wt", &["list", "--format=json"])?)
        .map_err(err)?;
    if raw.is_array() {
        return Ok(raw);
    }
    let rows = raw["items"]
        .as_array()
        .ok_or("Unsupported Worktrunk JSON schema")?;
    Ok(Value::Array(
        rows.iter()
            .filter(|row| row["worktree"]["path"].is_string())
            .map(|row| {
                let mut row = row.clone();
                row["path"] = row["worktree"]["path"].clone();
                row["is_main"] = row["worktree"]["main"].clone();
                row["is_current"] = row["worktree"]["current"].clone();
                row
            })
            .collect(),
    ))
}
pub fn create(
    project_id: Option<&str>,
    repo: &str,
    branch: &str,
    base: &str,
) -> Result<WorktreeRecord, String> {
    if branch.starts_with('-') || branch.is_empty() {
        return Err("Enter a valid branch name".into());
    }
    run(
        Path::new(repo),
        "git",
        &["check-ref-format", "--branch", branch],
    )?;
    let base = if base.is_empty() { "HEAD" } else { base };
    run(
        Path::new(repo),
        "git",
        &["rev-parse", "--verify", "--end-of-options", base],
    )?;
    run(
        Path::new(repo),
        "wt",
        &[
            "switch",
            "--create",
            "--no-cd",
            "--no-hooks",
            "--format=json",
            "--base",
            base,
            branch,
        ],
    )?;
    let all = list(repo)?;
    let row = all
        .as_array()
        .ok_or("Unexpected Worktrunk list format")?
        .iter()
        .find(|w| w["branch"] == branch)
        .ok_or("Worktrunk did not return the new worktree")?;
    let path = row["path"]
        .as_str()
        .ok_or("Worktree path missing")?
        .to_string();
    Ok(WorktreeRecord {
        id: id(),
        project_id: project_id.map(String::from),
        repo: repo.into(),
        path,
        branch: branch.into(),
        owned: true,
        state: "active".into(),
    })
}
fn manifest(root: &Path) -> Result<Value, String> {
    let mut entries = serde_json::Map::new();
    for entry in WalkDir::new(root)
        .follow_links(false)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|e| e.depth() != 1 || e.file_name() != ".git")
    {
        let entry = entry.map_err(err)?;
        if entry.depth() == 0 {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(root)
            .map_err(err)?
            .to_str()
            .ok_or("Archive paths must be valid UTF-8")?
            .to_string();
        let meta = fs::symlink_metadata(entry.path()).map_err(err)?;
        #[cfg(unix)]
        let mode = {
            use std::os::unix::fs::PermissionsExt;
            meta.permissions().mode() & 0o7777
        };
        #[cfg(not(unix))]
        let mode = 0u32;
        let v = if meta.is_file() {
            let mut f = fs::File::open(entry.path()).map_err(err)?;
            let mut hash = Sha256::new();
            let mut b = [0; 65536];
            loop {
                let n = f.read(&mut b).map_err(err)?;
                if n == 0 {
                    break;
                }
                hash.update(&b[..n]);
            }
            json!({"kind":"file","sha256":format!("{:x}",hash.finalize()),"mode":mode})
        } else if meta.is_dir() {
            json!({"kind":"dir","mode":mode})
        } else if meta.file_type().is_symlink() {
            json!({"kind":"symlink","target":fs::read_link(entry.path()).map_err(err)?.to_str().ok_or("Non-UTF-8 symlink")?})
        } else {
            return Err(format!(
                "Cannot safely archive special file {rel}. Stop its service and retry."
            ));
        };
        entries.insert(rel, v);
    }
    Ok(Value::Object(entries))
}
pub fn archive(
    tree: &WorktreeRecord,
    session: &str,
    destination: &Path,
) -> Result<ArchiveRecord, String> {
    if !tree.owned {
        return Err("Harbor does not own this worktree".into());
    }
    let path = Path::new(&tree.path);
    let row = list(&tree.repo)?;
    let found = row
        .as_array()
        .ok_or("Invalid Worktrunk list")?
        .iter()
        .find(|w| w["path"] == tree.path)
        .cloned()
        .ok_or("Worktree is no longer registered")?;
    if found["is_main"] == true || !path.join(".git").is_file() {
        return Err("The main checkout cannot be removed".into());
    }
    // Refuse nested repositories: their external object stores cannot be captured by the parent bundle.
    for e in WalkDir::new(path).follow_links(false) {
        let e = e.map_err(err)?;
        if e.depth() > 1 && e.file_name() == ".git" {
            return Err("Nested repository detected; preserve it separately before cleanup".into());
        }
    }
    let archive_id = id();
    let dir = destination.join(&archive_id);
    fs::create_dir_all(&dir).map_err(err)?;
    let before = manifest(path)?;
    let head = run(path, "git", &["rev-parse", "HEAD"])?;
    let index_path = run(
        path,
        "git",
        &["rev-parse", "--path-format=absolute", "--git-path", "index"],
    )?;
    let index = dir.join("index");
    fs::copy(&index_path, &index).map_err(err)?;
    let bundle = dir.join("history.bundle");
    run(
        path,
        "git",
        &[
            "bundle",
            "create",
            bundle.to_str().ok_or("Invalid bundle path")?,
            "--all",
            "HEAD",
        ],
    )?;
    run(path, "git", &["bundle", "verify", bundle.to_str().unwrap()])?;
    let snapshot = dir.join("workspace.tar.gz");
    let file = fs::File::create(&snapshot).map_err(err)?;
    let encoder = flate2::write::GzEncoder::new(file, flate2::Compression::default());
    let mut tar = tar::Builder::new(encoder);
    tar.follow_symlinks(false);
    for e in fs::read_dir(path).map_err(err)? {
        let e = e.map_err(err)?;
        if e.file_name() == ".git" {
            continue;
        }
        if e.file_type().map_err(err)?.is_dir() {
            tar.append_dir_all(e.file_name(), e.path()).map_err(err)?
        } else {
            tar.append_path_with_name(e.path(), e.file_name())
                .map_err(err)?
        }
    }
    let enc = tar.into_inner().map_err(err)?;
    enc.finish().map_err(err)?.sync_all().map_err(err)?;
    let verify = dir.join("verify");
    fs::create_dir(&verify).map_err(err)?;
    unpack(&snapshot, &verify)?;
    if before != manifest(&verify)?
        || before != manifest(path)?
        || fs::read(&index_path).map_err(err)? != fs::read(&index).map_err(err)?
        || head != run(path, "git", &["rev-parse", "HEAD"])?
    {
        return Err("Worktree changed during archival. Its files have been kept; stop other writers and retry.".into());
    }
    fs::remove_dir_all(verify).map_err(err)?;
    fs::write(
        dir.join("manifest.json"),
        serde_json::to_vec_pretty(&before).map_err(err)?,
    )
    .map_err(err)?;
    Ok(ArchiveRecord {
        id: archive_id,
        session_id: session.into(),
        worktree: tree.clone(),
        bundle: bundle.to_string_lossy().into(),
        snapshot: snapshot.to_string_lossy().into(),
        index: index.to_string_lossy().into(),
        head,
        created_at: now(),
        restored: false,
    })
}
pub fn remove_verified(archive: &ArchiveRecord) -> Result<(), String> {
    if !archive.worktree.owned {
        return Err("Externally owned worktrees are never removed".into());
    }
    let path = Path::new(&archive.worktree.path);
    if !path.join(".git").is_file() {
        return Err("The main checkout cannot be removed".into());
    }
    let dir = Path::new(&archive.snapshot)
        .parent()
        .ok_or("Invalid archive")?;
    let before: Value =
        serde_json::from_slice(&fs::read(dir.join("manifest.json")).map_err(err)?).map_err(err)?;
    if before != manifest(Path::new(&archive.worktree.path))? {
        return Err("Files changed after archive verification; worktree retained".into());
    }
    let index = run(
        path,
        "git",
        &["rev-parse", "--path-format=absolute", "--git-path", "index"],
    )?;
    if fs::read(index).map_err(err)? != fs::read(&archive.index).map_err(err)?
        || run(path, "git", &["rev-parse", "HEAD"])? != archive.head
    {
        return Err("Git state changed after archive verification; worktree retained".into());
    }
    run(
        Path::new(&archive.worktree.repo),
        "wt",
        &[
            "remove",
            "--foreground",
            "--no-hooks",
            "--no-delete-branch",
            "--force",
            &archive.worktree.path,
        ],
    )?;
    Ok(())
}
fn unpack(snapshot: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(snapshot).map_err(err)?;
    let dec = flate2::read::GzDecoder::new(file);
    let mut a = tar::Archive::new(dec);
    a.set_preserve_permissions(true);
    a.unpack(dest).map_err(err)
}
pub fn restore(archive: &ArchiveRecord) -> Result<WorktreeRecord, String> {
    let repo = Path::new(&archive.worktree.repo);
    run(repo, "git", &["bundle", "verify", &archive.bundle])?;
    run(repo, "git", &["fetch", &archive.bundle, "HEAD"])?;
    let branch = format!("harbor/restore-{}", &archive.id[..8]);
    let mut tree = create(
        archive.worktree.project_id.as_deref(),
        &archive.worktree.repo,
        &branch,
        &archive.head,
    )?;
    let path = Path::new(&tree.path);
    // This is a just-created, unused worktree; replace its checkout with the verified archive.
    for entry in fs::read_dir(path).map_err(err)? {
        let entry = entry.map_err(err)?;
        if entry.file_name() == ".git" {
            continue;
        }
        let p = entry.path();
        if entry.file_type().map_err(err)?.is_dir() {
            fs::remove_dir_all(p).map_err(err)?
        } else {
            fs::remove_file(p).map_err(err)?
        }
    }
    unpack(Path::new(&archive.snapshot), path)?;
    let expected: Value = serde_json::from_slice(
        &fs::read(
            Path::new(&archive.snapshot)
                .parent()
                .unwrap()
                .join("manifest.json"),
        )
        .map_err(err)?,
    )
    .map_err(err)?;
    if manifest(path)? != expected {
        return Err(format!(
            "Restore verification failed. Recovery files remain in {}",
            tree.path
        ));
    }
    let index = run(
        path,
        "git",
        &["rev-parse", "--path-format=absolute", "--git-path", "index"],
    )?;
    fs::copy(&archive.index, index).map_err(err)?;
    tree.state = "active".into();
    Ok(tree)
}
pub fn has_uncommitted_changes(cwd: &str) -> Result<bool, String> {
    Ok(!run(
        Path::new(cwd),
        "git",
        &["status", "--porcelain=v1", "-z", "--untracked-files=normal", "--ignored=no"],
    )?.is_empty())
}
pub fn review(cwd: &str) -> Result<Value, String> {
    let p = Path::new(cwd);
    let status = run(p, "git", &["status", "--porcelain=v1", "-z"])?;
    let diff = run(
        p,
        "git",
        &["diff", "--no-ext-diff", "--no-color", "HEAD", "--"],
    )?;
    let names = run(p, "git", &["diff", "--name-only", "-z", "HEAD", "--"])?;
    let untracked = run(
        p,
        "git",
        &["ls-files", "--others", "--exclude-standard", "-z"],
    )?;
    let files: Vec<_> = names
        .split('\0')
        .chain(untracked.split('\0'))
        .filter(|s| !s.is_empty())
        .collect();
    Ok(json!({"status":status,"diff":diff,"files":files}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn uncommitted_changes_include_staged_unstaged_and_untracked_but_not_ignored() {
        let temp = tempfile::tempdir().unwrap();
        let repo = temp.path();
        run(repo, "git", &["init", "-b", "main"]).unwrap();
        fs::write(repo.join("tracked.txt"), "base\n").unwrap();
        fs::write(repo.join(".gitignore"), "ignored.txt\n").unwrap();
        run(repo, "git", &["add", "."]).unwrap();
        run(repo, "git", &["-c", "user.name=Harbor Test", "-c", "user.email=test@harbor.local", "commit", "-m", "initial"]).unwrap();
        // Use a real linked worktree, matching the archive flow.
        let tree_dir = tempfile::tempdir().unwrap();
        let tree = tree_dir.path().join("tree");
        run(repo, "git", &["worktree", "add", "-b", "test-changes", tree.to_str().unwrap()]).unwrap();
        let cwd = tree.to_str().unwrap();
        assert!(!has_uncommitted_changes(cwd).unwrap());
        fs::write(tree.join("ignored.txt"), "ignored\n").unwrap();
        assert!(!has_uncommitted_changes(cwd).unwrap());
        fs::write(tree.join("tracked.txt"), "modified\n").unwrap();
        assert!(has_uncommitted_changes(cwd).unwrap());
        run(&tree, "git", &["add", "tracked.txt"]).unwrap();
        assert!(has_uncommitted_changes(cwd).unwrap());
        run(&tree, "git", &["reset", "--hard", "HEAD"]).unwrap();
        fs::write(tree.join("new.txt"), "new\n").unwrap();
        assert!(has_uncommitted_changes(cwd).unwrap());
        fs::remove_file(tree.join("new.txt")).unwrap();
        assert!(!has_uncommitted_changes(cwd).unwrap());
        assert!(has_uncommitted_changes("/harbor/nonexistent/worktree").is_err());
    }
    #[test]
    fn base_branch_choices_include_local_and_remote_branches_without_symbolic_aliases() {
        let temp = tempfile::tempdir().unwrap();
        let repo = temp.path();
        run(repo, "git", &["init", "-b", "main"]).unwrap();
        run(repo, "git", &["-c", "user.name=Harbor Test", "-c", "user.email=test@harbor.local", "commit", "--allow-empty", "-m", "initial"]).unwrap();
        run(repo, "git", &["branch", "feature/search"]).unwrap();
        run(repo, "git", &["update-ref", "refs/remotes/origin/main", "HEAD"]).unwrap();
        run(repo, "git", &["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]).unwrap();
        let mut choices = branches(repo.to_str().unwrap()).unwrap();
        choices.sort();
        assert_eq!(choices, vec!["feature/search", "main", "origin/main"]);
        assert!(branches("/harbor/nonexistent/repository").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn stalled_folder_probe_times_out_and_reaps_process() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let executable = temp.path().join("stalled-git");
        let pid_file = temp.path().join("pid");
        fs::write(&executable, format!("#!/bin/sh\necho $$ > '{}'\nexec sleep 30\n", pid_file.display())).unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o755)).unwrap();
        let started = std::time::Instant::now();
        let result = probe_root(temp.path().to_str().unwrap(), executable.to_str().unwrap(), std::time::Duration::from_secs(1));
        assert!(result.unwrap_err().contains("timed out"));
        assert!(started.elapsed() < std::time::Duration::from_secs(4));
        let pid = fs::read_to_string(pid_file).unwrap();
        assert!(!Command::new("kill").args(["-0", pid.trim()]).output().unwrap().status.success());
    }
    #[test]
    fn archive_round_trip() {
        if crate::acp::resolve_executable("wt").is_none() {
            return;
        }
        let temp = tempfile::tempdir().unwrap();
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).unwrap();
        run(&repo, "git", &["init", "-b", "main"]).unwrap();
        run(&repo, "git", &["config", "user.email", "test@harbor.local"]).unwrap();
        run(&repo, "git", &["config", "user.name", "Harbor Test"]).unwrap();
        fs::write(repo.join("tracked.txt"), "base\n").unwrap();
        fs::write(repo.join(".gitignore"), "ignored.txt\n").unwrap();
        run(&repo, "git", &["add", "."]).unwrap();
        run(&repo, "git", &["commit", "-m", "initial"]).unwrap();
        let tree = create(None, repo.to_str().unwrap(), "harbor-test", "main").unwrap();
        assert!(tree.project_id.is_none());
        let p = Path::new(&tree.path);
        fs::write(p.join("tracked.txt"), "staged\n").unwrap();
        run(p, "git", &["add", "tracked.txt"]).unwrap();
        fs::write(p.join("tracked.txt"), "unstaged\n").unwrap();
        fs::write(p.join("new.txt"), "untracked").unwrap();
        fs::write(p.join("ignored.txt"), "ignored data").unwrap();
        let before = run(p, "git", &["status", "--porcelain=v1"]).unwrap();
        let a = archive(&tree, "s", &temp.path().join("archives")).unwrap();
        let mut external = tree.clone();
        external.owned = false;
        assert!(archive(&external, "s", &temp.path().join("archives")).is_err());
        fs::write(p.join("after-archive.txt"), "concurrent writer").unwrap();
        assert!(remove_verified(&a).is_err());
        assert!(p.exists());
        fs::remove_file(p.join("after-archive.txt")).unwrap();
        remove_verified(&a).unwrap();
        assert!(!p.exists());
        let r = restore(&a).unwrap();
        assert!(r.project_id.is_none());
        let rp = Path::new(&r.path);
        assert_eq!(
            before,
            run(rp, "git", &["status", "--porcelain=v1"]).unwrap()
        );
        assert_eq!(
            fs::read_to_string(rp.join("ignored.txt")).unwrap(),
            "ignored data"
        );
        assert_eq!(run(rp, "git", &["show", ":tracked.txt"]).unwrap(), "staged");
        run(
            &repo,
            "wt",
            &[
                "remove",
                "--foreground",
                "--no-hooks",
                "--force",
                "--no-delete-branch",
                &r.path,
            ],
        )
        .unwrap();
    }
    #[test]
    fn reject_paths_outside_workspace() {
        let t = tempfile::tempdir().unwrap();
        assert!(crate::acp::workspace_path(t.path(), "/etc/passwd", false).is_err());
        assert!(crate::acp::workspace_path(t.path(), "relative", true).is_err());
    }
}
