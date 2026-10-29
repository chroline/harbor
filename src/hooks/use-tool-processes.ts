import { useEffect, useState } from "react";
import { call } from "../lib/api";

export type ToolProcess = {
  id: string;
  command: string;
  cwd: string;
  startedAt: number;
  wireSessionId: string;
  output: string;
  truncated: boolean;
  exitCode: number | null;
  stopped: boolean;
};

export function useToolProcesses(sessionId: string, enabled = true) {
  const [processes, setProcesses] = useState<ToolProcess[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const next = await call<ToolProcess[]>("list_tool_processes", {
          sessionId,
        });
        if (!disposed) {
          setProcesses(next ?? []);
          setUnavailable(false);
          setLoaded(true);
        }
      } catch {
        if (!disposed) setUnavailable(true);
      }
      if (!disposed) timer = setTimeout(refresh, 1000);
    };
    setProcesses([]);
    setLoaded(false);
    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [sessionId, enabled]);
  return { processes, unavailable, loaded };
}
