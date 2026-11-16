#!/usr/bin/env node
// Launches tests/ui-screenshots-browser.mjs in ego-browser.
// usage: node tests/ui-screenshots.mjs [server URL, default http://localhost:1420/]
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const url = process.argv[2] ?? "http://localhost:1420/";
try {
  await fetch(url);
} catch {
  console.error(`No dev server at ${url}. Start one with: npx vite --port ${new URL(url).port || 1420}`);
  process.exit(1);
}
const script = await readFile(`${root}/tests/ui-screenshots-browser.mjs`, "utf8");
const child = spawn("ego-browser", ["nodejs"], { stdio: ["pipe", "inherit", "inherit"] });
child.stdin.end(
  `globalThis.HARBOR_ROOT = ${JSON.stringify(root)};\nglobalThis.HARBOR_UI_URL = ${JSON.stringify(url)};\n${script}`,
);
child.on("exit", (code) => process.exit(code ?? 1));
