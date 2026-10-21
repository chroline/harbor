import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Bootstrap } from "./bindings/Bootstrap";
import type { CommandRequest } from "./bindings/CommandRequest";
export const desktop = isTauri();
export function json(value: unknown): Bootstrap["settings"] {
  return JSON.parse(JSON.stringify(value));
}
type CommandCall = {
  [K in CommandRequest["command"]]: Extract<
    CommandRequest,
    { command: K }
  > extends { args: infer A }
    ? [command: K, args: A]
    : [command: K];
}[CommandRequest["command"]];
export async function call<T>(...input: CommandCall): Promise<T> {
  const [command, args] = input;
  if (!desktop)
    throw new Error(
      "Open the Harbor desktop app to connect local agents. The browser is a visual preview.",
    );
  return invoke<T>(command, args);
}
export const browserBootstrap: Bootstrap = {
  projects: [],
  workspaces: [],
  providers: [
    {
      id: "codex",
      name: "Codex",
      command: "codex-acp",
      args: [],
      nativeCommand: "codex",
      installHint: "npm install -g @agentclientprotocol/codex-acp@2.1.1",
      color: "mint",
    },
    {
      id: "claude",
      name: "Claude Code",
      command: "claude-agent-acp",
      args: [],
      nativeCommand: "claude",
      installHint:
        "npm install -g @agentclientprotocol/claude-agent-acp@0.88.0",
      color: "peach",
    },
    {
      id: "cursor",
      name: "Cursor",
      command: "agent",
      args: ["acp"],
      nativeCommand: "agent",
      installHint: "Install Cursor CLI",
      color: "violet",
    },
    {
      id: "pi",
      name: "Pi",
      command: "pi-acp",
      args: [],
      nativeCommand: "pi",
      installHint: "Install pi-acp",
      color: "rose",
    },
    {
      id: "prime",
      name: "Prime Agent",
      command: "prime-agent",
      args: ["--mode", "acp"],
      nativeCommand: "prime-agent",
      installHint: "Install Prime Agent",
      color: "blue",
    },
    {
      id: "opencode",
      name: "OpenCode",
      command: "opencode",
      args: ["acp"],
      nativeCommand: "opencode",
      installHint: "Install OpenCode",
      color: "sand",
    },
    {
      id: "grok",
      name: "Grok Build",
      command: "grok",
      args: ["--no-auto-update", "agent", "stdio"],
      nativeCommand: "grok",
      installHint:
        "Install Grok Build: curl -fsSL https://x.ai/cli/install.sh | bash; then run grok login",
      color: "sand",
    },
  ],
  sessions: [],
  worktrees: [],
  archives: [],
  settings: { theme: "dark", notifications: false },
};
