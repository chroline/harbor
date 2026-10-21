import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

// Keep this certificate across builds: macOS records folder grants against the
// app's designated requirement, which includes its signing certificate.
const identity = "Harbor Local Development";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error || result.status !== 0) {
    // Do not include arguments: security import receives a temporary password.
    throw new Error(
      `${basename(command)} failed: ${result.error?.message ?? result.stderr}`,
    );
  }
  return result.stdout;
}

function ensureIdentity() {
  if (process.platform !== "darwin") return;
  if (
    process.env.APPLE_SIGNING_IDENTITY &&
    process.env.APPLE_SIGNING_IDENTITY !== identity
  )
    return;

  // Self-signed certificates are listed as matching, but not globally trusted,
  // identities. Do not use find-identity -v or change the system trust settings.
  const identities = run("/usr/bin/security", [
    "find-identity",
    "-p",
    "codesigning",
  ]);
  if (identities.includes(`"${identity}"`)) {
    console.log(`Using existing signing identity: ${identity}`);
    return;
  }

  const certificate = spawnSync("/usr/bin/security", [
    "find-certificate",
    "-c",
    identity,
  ]);
  if (certificate.status === 0) {
    throw new Error(
      `The ${identity} certificate exists but its private key is unavailable. Restore or unlock its keychain; do not replace the certificate, which would reset folder permissions.`,
    );
  }

  const keychain = run("/usr/bin/security", ["default-keychain", "-d", "user"])
    .trim()
    .replace(/^"|"$/g, "");
  if (!keychain)
    throw new Error("A default user keychain is required for local signing.");
  const directory = mkdtempSync(join(tmpdir(), "harbor-signing-"));
  const password = randomBytes(32).toString("hex");
  try {
    const key = join(directory, "key.pem");
    const cert = join(directory, "cert.pem");
    const bundle = join(directory, "identity.p12");
    run("/usr/bin/openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:3072",
      "-nodes",
      "-sha256",
      "-days",
      "3650",
      "-subj",
      `/CN=${identity}/`,
      "-addext",
      "basicConstraints=critical,CA:FALSE",
      "-addext",
      "keyUsage=critical,digitalSignature",
      "-addext",
      "extendedKeyUsage=critical,codeSigning",
      "-keyout",
      key,
      "-out",
      cert,
    ]);
    // Apple's PKCS#12 importer requires these legacy container algorithms.
    run(
      "/usr/bin/openssl",
      [
        "pkcs12",
        "-export",
        "-inkey",
        key,
        "-in",
        cert,
        "-out",
        bundle,
        "-name",
        identity,
        "-macalg",
        "sha1",
        "-keypbe",
        "PBE-SHA1-3DES",
        "-certpbe",
        "PBE-SHA1-3DES",
        "-passout",
        "env:HARBOR_CERT_IMPORT_PASSWORD",
      ],
      { env: { ...process.env, HARBOR_CERT_IMPORT_PASSWORD: password } },
    );
    run("/usr/bin/security", [
      "import",
      bundle,
      "-k",
      keychain,
      "-P",
      password,
      "-T",
      "/usr/bin/codesign",
    ]);
    console.log(
      `Created persistent signing identity in your user keychain: ${identity}`,
    );
  } finally {
    // After import, only the keychain retains the private key.
    rmSync(directory, { recursive: true, force: true });
  }
}

try {
  ensureIdentity();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
