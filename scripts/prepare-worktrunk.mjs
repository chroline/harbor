import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Pin both the release and its archive digest; never execute an installer or
// substitute whichever Worktrunk happens to be installed on the build machine.
const version = "0.81.0";
const digests = {
  "aarch64-apple-darwin":
    "b9c3f2f8071554cf88500466d65d35e18ad5edad5762479a1f14bcddd5ab7882",
  "x86_64-apple-darwin":
    "211fa3585afa0ce243de0f007fbe2d8b86c5c88c85eda17d09311b32e8533714",
};
const target =
  process.env.TAURI_ENV_TARGET_TRIPLE ??
  process.argv[2] ??
  (process.platform === "darwin"
    ? `${process.arch === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`
    : "");
if (!digests[target])
  throw new Error(
    `Unsupported Worktrunk target: ${target}. Harbor packages macOS builds only.`,
  );

const directory = fileURLToPath(
  new URL("../src-tauri/binaries/", import.meta.url),
);
await mkdir(directory, { recursive: true });
const archiveName = `worktrunk-${target}.tar.xz`;
const cache = join(directory, `${version}-${archiveName}`);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
let archive = await readFile(cache).catch((error) => {
  if (error.code !== "ENOENT") throw error;
  return null;
});
if (!archive || sha256(archive) !== digests[target]) {
  const url = `https://github.com/max-sixty/worktrunk/releases/download/v${version}/${archiveName}`;
  console.log(`Downloading Worktrunk ${version} for ${target}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok)
    throw new Error(`Worktrunk download failed: HTTP ${response.status}`);
  archive = Buffer.from(await response.arrayBuffer());
  if (sha256(archive) !== digests[target])
    throw new Error("Worktrunk archive checksum mismatch");
  await writeFile(cache, archive);
}
const temporary = await mkdtemp(join(tmpdir(), "harbor-worktrunk-"));
try {
  const result = spawnSync(
    "/usr/bin/tar",
    ["-xJf", cache, "-C", temporary, `worktrunk-${target}/wt`],
    { encoding: "utf8" },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Worktrunk extraction failed: ${result.error?.message ?? result.stderr}`,
    );
  const binary = await readFile(join(temporary, `worktrunk-${target}`, "wt"));
  const destination = join(directory, `harbor-wt-${target}`);
  const existing = await readFile(destination).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (!existing || !existing.equals(binary))
    await writeFile(destination, binary);
  await chmod(destination, 0o755);
  console.log(`Worktrunk ${version} ready: ${destination}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
