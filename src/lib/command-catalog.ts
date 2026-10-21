import { useEffect, useState } from "react";
import { call, desktop } from "./api";
import { commandList, type AvailableCommand } from "./commands";
import type { ProviderDefinition } from "./bindings/ProviderDefinition";
export type CommandCatalog = {
  commands: AvailableCommand[];
  status: "loading" | "ready" | "unavailable" | "error";
  error?: string;
  retry?: () => void;
};
const pending = new Map<string, Promise<AvailableCommand[]>>();
function discover(key: string, providerId: string, cwd: string | null) {
  let promise = pending.get(key);
  if (!promise) {
    promise = call<AvailableCommand[]>("discover_commands", {
      providerId,
      cwd,
    }).then(commandList);
    pending.set(key, promise);
    void promise.finally(() => pending.delete(key)).catch(() => {});
  }
  return promise;
}
export function useCommandCatalog(
  provider: ProviderDefinition | undefined,
  cwd: string | null,
  enabled = true,
): CommandCatalog {
  const key = JSON.stringify([
    provider?.id,
    provider?.command,
    provider?.args,
    cwd,
  ]);
  const [attempt, retry] = useState(0);
  const [state, setState] = useState<{
    key: string;
    catalog: CommandCatalog;
  }>();
  useEffect(() => {
    if (!enabled || !provider || !desktop) return;
    let current = true;
    setState({ key, catalog: { status: "loading", commands: [] } });
    void discover(key, provider.id, cwd).then(
      (commands) => {
        if (current)
          setState({
            key,
            catalog: {
              commands,
              status: commands.length ? "ready" : "unavailable",
            },
          });
      },
      (error) => {
        if (current)
          setState({
            key,
            catalog: { commands: [], status: "error", error: String(error) },
          });
      },
    );
    const onFocus = () => retry((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => {
      current = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [key, enabled, attempt]);
  const catalog: CommandCatalog =
    !enabled || !provider || !desktop
      ? { commands: [], status: "unavailable" }
      : state?.key === key
        ? state.catalog
        : { commands: [], status: "loading" };
  return { ...catalog, retry: () => retry((n) => n + 1) };
}
