import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  useToolProcesses,
  type ToolProcess,
} from "../hooks/use-tool-processes";
import { call } from "../lib/api";
import { Button } from "./ui/button";
import { scaledSize } from "../lib/units";
import "@xterm/xterm/css/xterm.css";

export function ProcessTerminal({
  sessionId,
  initial,
  visible,
}: {
  sessionId: string;
  initial: ToolProcess;
  visible: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const previousOutput = useRef("");
  const { processes, unavailable, loaded } = useToolProcesses(
    sessionId,
    visible,
  );
  const [process, setProcess] = useState(initial);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = processes.find((p) => p.id === initial.id);
  useEffect(() => {
    if (current) setProcess(current);
  }, [current]);
  const missing = loaded && !current;
  useEffect(() => {
    if (!host.current) return;
    const terminal = new Terminal({
      disableStdin: true,
      convertEol: true,
      cursorBlink: false,
      scrollback: 10000,
      fontFamily: '"SFMono-Regular", Menlo, monospace',
      fontSize: scaledSize(15),
      theme: {
        background: "#181818",
        foreground: "#dedede",
        selectionBackground: "#404040",
      },
    });
    const addon = new FitAddon();
    terminal.loadAddon(addon);
    terminal.open(host.current);
    term.current = terminal;
    previousOutput.current = "";
    fit.current = addon;
    const observer = new ResizeObserver(() => {
      if (host.current?.clientWidth) addon.fit();
    });
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      terminal.dispose();
      term.current = null;
      fit.current = null;
    };
  }, []);
  useEffect(() => {
    if (!term.current) return;
    if (process.output.startsWith(previousOutput.current)) {
      term.current.write(process.output.slice(previousOutput.current.length));
    } else {
      term.current.reset();
      term.current.write(process.output);
    }
    previousOutput.current = process.output;
  }, [process.output]);
  useEffect(() => {
    if (visible && host.current?.clientWidth) fit.current?.fit();
  }, [visible]);
  const stop = async () => {
    setStopping(true);
    setError(null);
    try {
      await call("stop_tool_process", { sessionId, processId: process.id });
    } catch (e) {
      setError(String(e));
    } finally {
      setStopping(false);
    }
  };
  return (
    <>
      <div className="process-terminal-toolbar">
        <div>
          <code title={process.command}>{process.command}</code>
          <span>{process.cwd}</span>
        </div>
        <span role="status">
          {unavailable || missing
            ? "Process status unavailable"
            : process.exitCode === null
              ? "Running"
              : process.stopped
                ? "Stopped"
                : `Exited ${process.exitCode}`}
        </span>
        {process.exitCode === null && (
          <Button
            size="compact"
            variant="secondary"
            disabled={stopping || unavailable || missing}
            onClick={() => void stop()}
          >
            {stopping ? "Stopping…" : "Stop process"}
          </Button>
        )}
      </div>
      <div
        ref={host}
        className="native-terminal process-terminal"
        aria-label={`Terminal output for ${process.command}`}
      />
      {error && (
        <p role="alert" className="terminal-caption">
          {error}
        </p>
      )}
      <div className="terminal-caption">
        Process output ·{" "}
        {process.truncated ? "Showing the most recent output · " : ""}Read only
      </div>
    </>
  );
}
