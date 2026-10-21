import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Exercise the macOS code-identity checks used to recognize an app after an
// update. Run against the actual bundled app, not a mocked codesign executable.
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} failed: ${result.error?.message ?? result.stderr}`,
    );
  }
  return `${result.stdout}\n${result.stderr}`;
}

function signature(app) {
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
  const details = run("/usr/bin/codesign", ["-d", "--verbose=4", "-r-", app]);
  assert.match(details, /^Identifier=dev\.harbor\.desktop$/m);
  assert.doesNotMatch(details, /^Signature=adhoc$/m);
  const requirement = details.match(/^designated => (.+)$/m)?.[1];
  const hash = details.match(/^CDHash=(.+)$/m)?.[1];
  assert.ok(
    requirement && hash,
    "The bundle must have a designated requirement and code hash",
  );
  assert.doesNotMatch(
    requirement,
    /cdhash/i,
    "The identity must survive executable changes",
  );
  assert.match(
    requirement,
    /certificate leaf = H"[a-f0-9]+"/,
    "Pin the local signing certificate",
  );
  return { requirement, hash };
}

if (process.platform !== "darwin") {
  console.log("macOS signing verification is only available on macOS.");
} else {
  const app =
    process.argv[2] ??
    fileURLToPath(
      new URL(
        "../src-tauri/target/release/bundle/macos/Harbor.app",
        import.meta.url,
      ),
    );
  const original = signature(app);
  const directory = mkdtempSync(join(tmpdir(), "harbor-signing-regression-"));
  try {
    const updated = join(directory, "Harbor.app");
    cpSync(app, updated, { recursive: true });
    run("/usr/libexec/PlistBuddy", [
      "-c",
      "Set :CFBundleVersion 0.1.99999",
      join(updated, "Contents/Info.plist"),
    ]);
    run("/usr/bin/codesign", [
      "--force",
      "--sign",
      "Harbor Local Development",
      "--timestamp=none",
      "--options",
      "runtime",
      updated,
    ]);
    const next = signature(updated);
    assert.notEqual(
      next.hash,
      original.hash,
      "Exercise a changed bundle, not identical input",
    );
    assert.equal(
      next.requirement,
      original.requirement,
      "Updates must retain the app's identity",
    );
    run("/usr/bin/codesign", [
      "--verify",
      "--strict",
      "-R",
      `=${original.requirement}`,
      updated,
    ]);
    console.log(
      "PASS: valid signed bundle; changed bundle has a different code hash and satisfies the original identity.",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
