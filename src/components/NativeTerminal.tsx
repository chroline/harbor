import { scaledSize } from "@/lib/units";
import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen } from "@tauri-apps/api/event";
import { call } from "../lib/api";
import "@xterm/xterm/css/xterm.css";
export type TerminalStatus = { title: string; alive: boolean };
export function NativeTerminal({
  sessionId,
  visible,
  onStatus,
}: {
  sessionId: string;
  visible: boolean;
  onStatus?: (status: TerminalStatus) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const fit = useRef<FitAddon | null>(null);
  const terminal = useRef<Terminal | null>(null);
  const statusCallback = useRef(onStatus);
  statusCallback.current = onStatus;
  const trackStatus = !!onStatus;
  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    let off: (() => void) | undefined;
    let ready = false;
    let end = 0;
    let replaying = false;
    type Output = { sessionId?: string; bytes: number[]; end: number };
    const queued: Output[] = [];
    const term = new Terminal({
      fontFamily: '"SFMono-Regular", Menlo, monospace',
      fontSize: scaledSize(15),
      cursorBlink: true,
      scrollback: 10000,
      theme: {
        background: "#181818",
        foreground: "#dedede",
        cursor: "#dedede",
        selectionBackground: "#404040",
      },
    });
    const addon = new FitAddon();
    terminal.current = term;
    fit.current = addon;
    term.loadAddon(addon);
    term.open(host.current);
    term.attachCustomKeyEventHandler(
      (event) =>
        !(
          (event.metaKey ||
            (event.ctrlKey && !/Mac/.test(navigator.platform))) &&
          !event.shiftKey &&
          !event.altKey &&
          ["t", "w"].includes(event.key.toLowerCase())
        ),
    );
    let processTitle = "";
    let customTitle = "";
    let alive = true;
    let statusTimer: ReturnType<typeof setTimeout> | undefined;
    const titleChange = term.onTitleChange((title) => {
      if (!alive) return;
      customTitle = title.trim().slice(0, 512);
      statusCallback.current?.({ title: customTitle || processTitle, alive });
    });
    const pollStatus = async () => {
      try {
        const status = await call<TerminalStatus>("terminal_status", {
          sessionId,
        });
        if (disposed) return;
        if ((processTitle && processTitle !== status.title) || !status.alive)
          customTitle = "";
        processTitle = status.title;
        alive = status.alive;
        statusCallback.current?.({ title: customTitle || processTitle, alive });
      } catch {
        /* A terminal may close while a status request is in flight. */
      }
      if (!disposed && alive) statusTimer = setTimeout(pollStatus, 700);
    };
    if (trackStatus) void pollStatus();
    const write = (o: Output) => {
      if (o.end <= end) return;
      const start = o.end - o.bytes.length;
      term.write(new Uint8Array(o.bytes.slice(Math.max(0, end - start))));
      end = o.end;
    };
    void listen<Output>("terminal-data", (e) => {
      if (e.payload.sessionId === sessionId) {
        if (ready) write(e.payload);
        else queued.push(e.payload);
      }
    })
      .then(async (fn) => {
        if (disposed) fn();
        else {
          off = fn;
          const snapshot = await call<Output>("terminal_snapshot", {
            sessionId,
          });
          if (disposed) return;
          replaying = true;
          term.write(new Uint8Array(snapshot.bytes), () => {
            replaying = false;
          });
          end = snapshot.end;
          ready = true;
          for (const output of queued) write(output);
          queued.length = 0;
        }
      })
      .catch(() => {
        ready = true;
      });
    const input = term.onData((data) => {
      if (!replaying)
        void call("terminal_input", { sessionId, data }).catch(() => {});
    });
    const resized = term.onResize(({ rows, cols }) => {
      void call("terminal_resize", { sessionId, rows, cols }).catch(() => {});
    });
    const observer = new ResizeObserver(() => {
      if (host.current?.clientWidth) addon.fit();
    });
    observer.observe(host.current);
    return () => {
      disposed = true;
      off?.();
      clearTimeout(statusTimer);
      titleChange.dispose();
      input.dispose();
      resized.dispose();
      observer.disconnect();
      term.dispose();
      terminal.current = null;
      fit.current = null;
    };
  }, [sessionId, trackStatus]);
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      fit.current?.fit();
      terminal.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);
  return (
    <div
      ref={host}
      className="native-terminal"
      style={{ display: visible ? "block" : "none" }}
      aria-label={trackStatus ? "Shell terminal" : "Native agent terminal"}
    />
  );
}
