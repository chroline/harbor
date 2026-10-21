import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "../lib/api";
import type { TerminalStatus } from "../components/NativeTerminal";
import { listen } from "@tauri-apps/api/event";

export type TerminalTab = TerminalStatus & { id: string };

export function useTerminalTabs(
  sessionId: string,
  onError: (message: string) => void,
) {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const pending = useRef(false);
  const closed = useRef(new Set<string>());
  useEffect(() => {
    let disposed = false;
    void call<TerminalTab[]>("list_shell_terminals", { sessionId })
      .then((saved) => {
        if (!disposed)
          setTabs((current) => [
            ...(saved ?? []).filter(
              (tab) =>
                !closed.current.has(tab.id) &&
                !current.some((t) => t.id === tab.id),
            ),
            ...current,
          ]);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [sessionId]);
  useEffect(() => {
    let disposed = false;
    let off: (() => void) | undefined;
    void listen<string>("task-tabs-changed", (event) => {
      if (event.payload !== sessionId) return;
      void call<TerminalTab[]>("list_shell_terminals", { sessionId })
        .then((saved) => {
          if (!disposed) {
            setTabs(saved ?? []);
            setActive((id) =>
              saved?.some((tab) => tab.id === id) ? id : null,
            );
          }
        })
        .catch(() => {});
    })
      .then((stop) => {
        if (disposed) stop();
        else off = stop;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      off?.();
    };
  }, [sessionId]);
  const create = async () => {
    if (pending.current) return;
    pending.current = true;
    setCreating(true);
    try {
      const tab = await call<TerminalTab>("create_shell_terminal", {
        sessionId,
      });
      setTabs((current) => [...current.filter((t) => t.id !== tab.id), tab]);
      setActive(tab.id);
    } catch (error) {
      onError(String(error));
    } finally {
      pending.current = false;
      setCreating(false);
    }
  };
  const close = async (id: string) => {
    try {
      await call("close_shell_terminal", { terminalId: id });
      closed.current.add(id);
      setTabs((current) => current.filter((tab) => tab.id !== id));
      setActive((current) => (current === id ? null : current));
    } catch (error) {
      onError(String(error));
    }
  };
  const update = useCallback((id: string, status: TerminalStatus) => {
    setTabs((current) =>
      current.some(
        (tab) =>
          tab.id === id &&
          (tab.title !== status.title || tab.alive !== status.alive),
      )
        ? current.map((tab) => (tab.id === id ? { ...tab, ...status } : tab))
        : current,
    );
  }, []);
  return { tabs, active, setActive, creating, create, close, update };
}
