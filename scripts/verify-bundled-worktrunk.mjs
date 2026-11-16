import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { accessSync, constants, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const app = resolve(
  process.argv[2] ?? "src-tauri/target/release/bundle/macos/Harbor.app",
);
const helper = join(app, "Contents/MacOS/harbor-wt");
accessSync(helper, constants.X_OK);
accessSync(join(app, "Contents/Resources/licenses/WORKTRUNK-LICENSE"));
const temporary = mkdtempSync(join(tmpdir(), "harbor-bundled-worktrunk-"));
// Deliberately exclude Homebrew, Cargo, and all user-installed tools.
const env = {
  ...process.env,
  PATH: "/usr/bin:/bin",
  HOME: temporary,
  XDG_CONFIG_HOME: join(temporary, "config"),
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
};
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: temporary,
    env,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} failed: ${result.error?.message ?? result.stderr}`,
    );
  return result.stdout.trim();
}
function wt(args) {
  return run(helper, [
    "--config",
    join(temporary, "worktrunk.toml"),
    "--config-set",
    `worktree-path=${JSON.stringify(join(temporary, "trees/{{ branch | sanitize }}"))}`,
    ...args,
  ]);
}
try {
  run("/usr/bin/codesign", ["--verify", "--strict", helper]);
  assert.equal(wt(["--version"]), "wt v0.81.0");
  run("git", ["init", "-b", "main"]);
  run("git", [
    "-c",
    "user.name=Harbor Test",
    "-c",
    "user.email=test@harbor.local",
    "commit",
    "--allow-empty",
    "-m",
    "initial",
  ]);
  wt([
    "switch",
    "--create",
    "harbor-bundle-test",
    "--base",
    "main",
    "--no-cd",
    "--no-hooks",
    "--yes",
  ]);
  const tree = join(temporary, "trees/harbor-bundle-test");
  assert.ok(wt(["list", "--format=json"]).includes("harbor-bundle-test"));
  wt([
    "remove",
    "--foreground",
    "--no-hooks",
    "--force",
    "--no-delete-branch",
    tree,
  ]);
  assert.equal(
    run("git", ["worktree", "list", "--porcelain"]).split("worktree ").length -
      1,
    1,
  );
  console.log(
    "PASS: signed bundled Worktrunk creates, lists, and removes worktrees without a global installation.",
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
