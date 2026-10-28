import { useState, type ReactNode } from "react";
import {
  Brain,
  BookOpen,
  Check,
  CircleAlert,
  Circle,
  FileCode2,
  FilePlus,
  Clock,
  CornerDownLeft,
  Globe,
  Network,
  Pencil,
  Play,
  Search,
  Trash2,
  MessageSquare,
} from "@/lib/icons";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "./ui/trace";
import { record, str } from "../lib/protocol";
import type { SubagentRecord } from "../lib/bindings/SubagentRecord";

export type TraceStatus = "running" | "error" | "pending" | undefined;
export function traceStatus(status: string, ended = false): TraceStatus {
  if (["failed", "interrupted", "error"].includes(status)) return "error";
  if (ended) return undefined;
  if (["in_progress", "running", "working", "queued"].includes(status))
    return "running";
  if (status === "pending") return "pending";
  return undefined;
}
export function ToolGlyph({ kind, name }: { kind: string; name?: string }) {
  const namedIcon = (
    {
      write: FilePlus,
      edit: Pencil,
      multiedit: Pencil,
      skill: BookOpen,
      agent: Network,
      task: Network,
      subagenthandback: CornerDownLeft,
      taskoutput: CornerDownLeft,
      toolsearch: Search,
      schedulewakeup: Clock,
      spawn_agent: Network,
      send_message: MessageSquare,
      followup_task: MessageSquare,
      wait_agent: Clock,
      wait: Clock,
    } as Record<string, typeof Circle>
  )[name?.toLowerCase() ?? ""];
  const Icon =
    namedIcon ??
    (
      {
        read: FileCode2,
        skill: BookOpen,
        write: FilePlus,
        edit: Pencil,
        delete: Trash2,
        search: Search,
        fetch: Globe,
        execute: Play,
        think: Brain,
      } as Record<string, typeof Circle>
    )[kind] ??
    Circle;
  return <Icon />;
}

export function TraceStep({
  label,
  status,
  description,
  icon,
  children,
  detailLabel,
  defaultOpen = false,
}: {
  label: string;
  status?: TraceStatus;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
  detailLabel?: string;
  defaultOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = expanded ?? defaultOpen;
  const line = (
    <TraceLine status={status} className="activity-step">
      {icon && <TraceIcon>{icon}</TraceIcon>}
      <TraceTitle>{label}</TraceTitle>
      {description && <TraceDescription>{description}</TraceDescription>}
      {status && !description && <span className="sr-only">{status}</span>}
    </TraceLine>
  );
  if (children === undefined) return line;
  return (
    <TraceCollapsible open={open} onOpenChange={setExpanded}>
      <TraceCollapsibleTrigger aria-label={detailLabel ?? label}>
        {line}
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>{children}</TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

export function PlanTrace({ entries }: { entries: unknown[] }) {
  return (
    <TraceCollapsible className="agent-plan" defaultOpen>
      <TraceCollapsibleTrigger>
        <TraceLine>
          <TraceIcon>
            <Check />
          </TraceIcon>
          <TraceTitle>
            Plan ·{" "}
            {entries.filter((p) => record(p).status === "completed").length} of{" "}
            {entries.length}
          </TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <Trace>
          {entries.map((entry, i) => {
            const item = record(entry);
            return (
              <TraceStep
                key={i}
                label={str(item.content, str(item.title))}
                status={traceStatus(str(item.status))}
                description={str(item.status).replaceAll("_", " ")}
                icon={item.status === "completed" ? <Check /> : <Circle />}
              />
            );
          })}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

export function SubagentTrace({
  workers,
  onSelect,
}: {
  workers: SubagentRecord[];
  onSelect: (id: string) => void;
}) {
  return (
    <TraceCollapsible className="subagent-trace" defaultOpen>
      <TraceCollapsibleTrigger>
        <TraceLine>
          <TraceIcon>
            <Network />
          </TraceIcon>
          <TraceTitle>Subagents · {workers.length}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <Trace>
          {workers.map((worker) => {
            const state = record(worker.state);
            const status = str(state.type, str(state.state, "unknown"));
            return (
              <button
                className="subagent-trace-link"
                key={worker.sessionId}
                onClick={() => onSelect(worker.sessionId)}
                aria-label={`Open ${worker.title} conversation`}
              >
                <TraceLine status={traceStatus(status)}>
                  <TraceIcon>
                    {traceStatus(status) === "error" ? (
                      <CircleAlert />
                    ) : status === "completed" ? (
                      <Check />
                    ) : (
                      <Network />
                    )}
                  </TraceIcon>
                  <TraceTitle>{worker.title}</TraceTitle>
                  <TraceDescription>
                    {status.replaceAll("_", " ")}
                  </TraceDescription>
                </TraceLine>
              </button>
            );
          })}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}
