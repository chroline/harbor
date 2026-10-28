import { Clock } from "../lib/icons";
import type { Tool } from "../lib/protocol";
import { wakeupPresentation } from "../lib/tool-presentation";
import { TraceStep, traceStatus } from "./AgentTrace";

export function WakeupTool({ tool }: { tool: Tool }) {
  const wakeup = wakeupPresentation(tool);
  if (!wakeup) return null;
  return (
    <TraceStep
      label={wakeup.title}
      icon={<Clock />}
      status={traceStatus(tool.status, tool.workCompletedAt !== undefined)}
      detailLabel="View details"
    >
      {wakeup.delay ? (
        <div className="tool-detail">
          <p className="m-0 opacity-75">{wakeup.delay}</p>
        </div>
      ) : undefined}
    </TraceStep>
  );
}
