import { supportedProviders } from "./bindings/supported-providers";
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
  providers: supportedProviders,
  sessions: [],
  worktrees: [],
  archives: [],
  settings: { theme: "dark", notifications: false },
};
