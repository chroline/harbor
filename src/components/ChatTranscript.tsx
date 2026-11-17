import { WakeupTool } from "./WakeupTool";
import { Fragment, useRef, useState, type ReactNode } from "react";
import { Brain } from "@/lib/icons";
import { Message, MessageContent } from "./ui/message";
import { Bubble, BubbleContent } from "./ui/bubble";
import { MessageAttachments } from "./MessageAttachments";
import { ThinkingIndicatorGlyph } from "./ui/thinking-indicator";
import { RichText } from "./shared";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "./ui/trace";
import { TraceStep, ToolGlyph, traceStatus } from "./AgentTrace";
import {
  TranscriptRow,
  VirtualTranscriptTurn,
  useTranscriptScroller,
} from "./ChatScroller";
import type { TimelineEntry, Tool, RecordedInteraction } from "../lib/protocol";
import "./chat-transcript.css";
import { diffStats } from "../lib/file-diff";
import {
  toolActivityKind,
  toolActivityLabel,
  toolFileChanges,
  toolPresentation,
} from "../lib/tool-presentation";

type ActivityEntry =
  | Extract<TimelineEntry, { type: "tool" }>
  | Extract<TimelineEntry, { type: "message" }>;
type TranscriptGroup =
  | { type: "message"; entry: Extract<TimelineEntry, { type: "message" }> }
  | { type: "activity"; id: string; entries: ActivityEntry[] };

// Keep prose in its original position; only adjacent tools and reasoning fold
// together. A streaming update keeps the first entry's key and disclosure state.
export function groupActivity(entries: TimelineEntry[]): TranscriptGroup[] {
  const groups: TranscriptGroup[] = [];
  for (const entry of entries) {
    if (entry.type === "message" && entry.message.role !== "thought") {
      groups.push({ type: "message", entry });
      continue;
    }
    const previous = groups.at(-1);
    if (previous?.type === "activity") previous.entries.push(entry);
    else
      groups.push({
        type: "activity",
        id: entry.type === "tool" ? entry.tool.id : entry.message.id,
        entries: [entry],
      });
  }
  return groups;
}

function Activity({
  entries,
  renderTool,
  active = false,
  endedBefore,
  streamingId,
  expanded: savedExpanded,
  onExpandedChange,
}: {
  entries: ActivityEntry[];
  renderTool: (tool: Tool) => ReactNode;
  active?: boolean;
  endedBefore?: number;
  streamingId?: string;
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
}) {
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const tools = entries.flatMap((entry) =>
    entry.type === "tool" ? [entry.tool] : [],
  );
  const toolsRunning = tools.some(
    (tool) =>
      ["pending", "in_progress"].includes(tool.status) &&
      tool.workCompletedAt === undefined,
  );
  const running = active || toolsRunning;
  const open = savedExpanded ?? expanded ?? running;
  const duration = activityDuration(entries, endedBefore);
  const heading = running
    ? "Working..."
    : duration === null
      ? "Worked"
      : `Worked for ${formatWorkDuration(duration)}`;
  return (
    <TraceCollapsible
      className="transcript-activity"
      open={open}
      onOpenChange={onExpandedChange ?? setExpanded}
    >
      <TraceCollapsibleTrigger aria-label={heading}>
        <TraceLine status={running ? "running" : undefined}>
          {running && (
            <TraceIcon>
              <ThinkingIndicatorGlyph />
            </TraceIcon>
          )}
          <TraceTitle>{heading}</TraceTitle>
          {/* Everything this block changed, without opening it. */}
          <DiffStat tools={tools} />
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <Trace>
          {entries.map((entry, index) =>
            entry.type === "tool" ? (
              toolPresentation(entry.tool).wakeup ? (
                <WakeupTool key={entry.tool.id} tool={entry.tool} />
              ) : (
                <TraceStep
                  key={entry.tool.id}
                  label={toolActivityLabel(entry.tool)}
                  icon={
                    <ToolGlyph
                      kind={toolActivityKind(entry.tool)}
                      name={entry.tool.name || entry.tool.title}
                    />
                  }
                  status={traceStatus(
                    entry.tool.status,
                    entry.tool.workCompletedAt !== undefined,
                  )}
                  description={
                    entry.tool.status === "interrupted"
                      ? "Interrupted"
                      : undefined
                  }
                  stats={<DiffStat tools={[entry.tool]} />}
                  detailLabel="View details"
                >
                  {renderTool(entry.tool)}
                </TraceStep>
              )
            ) : (
              <TraceStep
                key={entry.message.id}
                label={
                  active && entry === entries.at(-1)
                    ? "Thinking…"
                    : thoughtLabel(entry.message, entries[index + 1], endedBefore)
                }
                icon={<Brain />}
                status={
                  active && entry === entries.at(-1) ? "running" : undefined
                }
                detailLabel="View reasoning"
                defaultOpen={active && entry === entries.at(-1)}
              >
                <RichText
                  text={entry.message.text}
                  streaming={streamingId === entry.message.id}
                />
              </TraceStep>
            ),
          )}
          {active && !toolsRunning && entries.at(-1)?.type !== "message" && (
            <TraceStep
              label="Thinking…"
              status="running"
              icon={<ThinkingIndicatorGlyph />}
            />
          )}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

/** "+added -removed" for the files tools changed, in the diff header's colors. */
function DiffStat({ tools }: { tools: Tool[] }) {
  let added = 0;
  let removed = 0;
  for (const tool of tools)
    for (const file of toolFileChanges(tool)) {
      const side = (value: unknown) =>
        typeof value === "string" || value === null ? value : undefined;
      const stats = diffStats(side(file.oldText), side(file.newText));
      added += stats.added;
      removed += stats.removed;
    }
  if (!added && !removed) return null;
  return (
    <span
      aria-hidden
      className="flex shrink-0 gap-1.5 font-mono text-xs"
    >
      <span dir="ltr" className="text-success">+{added}</span>
      <span dir="ltr" className="text-destructive">-{removed}</span>
    </span>
  );
}

// Thinking ends when its last chunk lands, or when the next step begins.
function thoughtLabel(
  message: { timestamp?: number; updatedAt?: number; workCompletedAt?: number },
  next?: ActivityEntry,
  endedBefore?: number,
) {
  const start = message.timestamp;
  if (start === undefined) return "Thought";
  const nextStart = next
    ? next.type === "tool"
      ? next.tool.timestamp
      : next.message.timestamp
    : undefined;
  // workCompletedAt is the whole turn's end, shared by every step, so it only
  // stands in for the last thought, which has no next step; the next prose
  // segment (endedBefore) closes it earlier.
  const closedAt =
    nextStart === undefined && message.workCompletedAt !== undefined
      ? endedBefore === undefined
        ? message.workCompletedAt
        : Math.min(message.workCompletedAt, endedBefore)
      : undefined;
  const end = Math.max(
    start,
    message.updatedAt ?? start,
    nextStart ?? start,
    closedAt ?? start,
  );
  const elapsed = end - start;
  if (elapsed < 1000) return `Thought for ${Math.round(elapsed)}ms`;
  // Two significant figures under a minute: 1.2s, 12s, 43s.
  const seconds = Number((elapsed / 1000).toPrecision(2));
  return `Thought for ${seconds < 60 ? `${seconds}s` : formatWorkDuration(elapsed)}`;
}

// Use recorded event times so reopening a chat doesn't restart its timer.
// The next prose segment closes an earlier block of adjacent activity.
function activityDuration(entries: ActivityEntry[], endedBefore?: number) {
  const values = entries.map((entry) =>
    entry.type === "tool" ? entry.tool : entry.message,
  );
  const starts = values.flatMap((value) =>
    value.timestamp === undefined ? [] : [value.timestamp],
  );
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const end = Math.max(
    start,
    ...values.map(
      (value) =>
        value.workCompletedAt ?? value.updatedAt ?? value.timestamp ?? start,
    ),
  );
  return Math.max(
    0,
    (endedBefore === undefined ? end : Math.min(end, endedBefore)) - start,
  );
}

function formatWorkDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 1) return `${Math.round(milliseconds)}ms`;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return `${minutes}m${seconds % 60 ? ` ${seconds % 60}s` : ""}`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}

// Only the reply still arriving gets the word reveal. Settled history stays
// plain markdown so reopening a chat does not replay it.
function activeStreamId(entries: TimelineEntry[], working: boolean) {
  if (!working) return undefined;
  const last = entries.at(-1);
  if (
    last?.type !== "message" ||
    last.message.role === "user" ||
    last.message.planReview
  )
    return undefined;
  return last.message.id;
}

function TranscriptTurn({
  id,
  anchor,
  live,
  header,
  children,
}: {
  id: string;
  anchor: boolean;
  live: boolean;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <VirtualTranscriptTurn id={id} anchor={anchor} live={live} user>
      <div className="transcript-prompt-header">{header}</div>
      <div className="transcript-responses">{children}</div>
    </VirtualTranscriptTurn>
  );
}

export function ChatTranscript({
  entries,
  renderTool,
  renderPlan,
  working = false,
  children,
}: {
  entries: TimelineEntry[];
  renderTool: (tool: Tool) => ReactNode;
  renderPlan?: (interaction: RecordedInteraction) => ReactNode;
  working?: boolean;
  children?: ReactNode;
}) {
  const groups = groupActivity(entries);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedActivities, setExpandedActivities] = useState<
    Record<string, boolean>
  >({});
  const toggleMessage = (id: string) => {
    setExpandedMessages((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  // The scroller considers an unhandled anchor a newly submitted turn, even
  // when a historical row remounts after scrolling back into view.
  // Keep automatic anchoring on the latest live user turn; history opens
  // at the bottom and all rows retain stable message IDs.
  const historyUsers = useRef(
    new Set(
      entries.flatMap((entry) =>
        entry.type === "message" && entry.message.role === "user"
          ? [entry.message.id]
          : [],
      ),
    ),
  );
  const latestUser = [...entries]
    .reverse()
    .find((entry) => entry.type === "message" && entry.message.role === "user");
  const streamingId = activeStreamId(entries, working);
  const inScroller = useTranscriptScroller();
  const Container = inScroller ? Fragment : "div";
  const rows = groups.map((group, index) => {
    const next = groups[index + 1];
    if (group.type === "activity")
      return (
        <TranscriptRow key={group.id} id={`activity:${group.id}`}>
          <Activity
            entries={group.entries}
            renderTool={renderTool}
            active={working && index === groups.length - 1}
            streamingId={streamingId}
            expanded={expandedActivities[group.id]}
            onExpandedChange={(open) =>
              setExpandedActivities((previous) => ({
                ...previous,
                [group.id]: open,
              }))
            }
            endedBefore={
              next?.type === "message"
                ? next.entry.message.timestamp
                : undefined
            }
          />
        </TranscriptRow>
      );
    const message = group.entry.message;
    if (message.planReview && renderPlan)
      return (
        <TranscriptRow key={message.id} id={`message:${message.id}`}>
          {renderPlan(message.planReview)}
        </TranscriptRow>
      );
    const expanded = expandedMessages.has(message.id);
    const attachments = message.attachments ?? [];
    const images = attachments.filter((file) => file.mimeType.startsWith("image/"));
    const documents = attachments.filter((file) => !file.mimeType.startsWith("image/"));
    const hasBody =
      message.text.trim().length > 0 ||
      !!message.label ||
      message.role === "system";
    const content = (
      <Message
        key={message.id}
        align={message.role === "user" ? "end" : "start"}
        className={`transcript-message transcript-${message.role}`}
        aria-label={
          message.label ??
          (message.role === "user"
            ? "Your message"
            : message.role === "system"
              ? "Parent relay"
              : "Assistant message")
        }
      >
        <MessageContent>
          {images.length > 0 && <MessageAttachments files={images} />}
          {hasBody && <Bubble
            align={message.role === "user" ? "end" : "start"}
            variant={message.role === "user" ? "muted" : "ghost"}
          >
            <BubbleContent title={message.role === "user" ? message.text : undefined}
              {...(message.role === "user"
                ? {
                    role: "button",
                    tabIndex: 0,
                    "aria-label": expanded
                      ? "Collapse message"
                      : "Expand message",
                    "aria-expanded": expanded,
                    "data-expanded": expanded,
                    onClick: (event) => {
                      // Links, attachments, code controls, and text selection
                      // keep their own interactions instead of toggling.
                      if (
                        (event.target as Element).closest(
                          "a, button, input, [role='button']",
                        ) !== event.currentTarget ||
                        window.getSelection()?.toString()
                      )
                        return;
                      toggleMessage(message.id);
                    },
                    onKeyDown: (event) => {
                      if (
                        event.target !== event.currentTarget ||
                        (event.key !== "Enter" && event.key !== " ")
                      )
                        return;
                      event.preventDefault();
                      toggleMessage(message.id);
                    },
                  }
                : {})}
            >
              {(message.label || message.role === "system") && (
                <small className="transcript-message-label">
                  {message.label ?? "Parent relay"}
                </small>
              )}
              <RichText
                text={message.text}
                commandRanges={
                  message.role === "user" ? message.commandRanges : undefined
                }
                streaming={streamingId === message.id}
              />
            </BubbleContent>
          </Bubble>}
          {documents.length > 0 && <MessageAttachments files={documents} />}
        </MessageContent>
      </Message>
    );
    return message.role === "user" ? (
      content
    ) : (
      <TranscriptRow key={message.id} id={`message:${message.id}`}>
        {content}
      </TranscriptRow>
    );
  });
  // Each user turn owns its responses, so native sticky positioning ends at
  // the next turn. The scroller still measures a stable, normal-flow turn row.
  const turns: {
    id: string;
    user?: Extract<TimelineEntry, { type: "message" }>["message"];
    rows: ReactNode[];
  }[] = [];
  groups.forEach((group, index) => {
    if (group.type === "message" && group.entry.message.role === "user") {
      turns.push({
        id: `message:${group.entry.message.id}`,
        user: group.entry.message,
        rows: [],
      });
    } else if (!turns.length) {
      turns.push({ id: "leading-activity", rows: [] });
    }
    turns.at(-1)!.rows.push(rows[index]);
  });
  const trailing = (
    <>
      {working && groups.at(-1)?.type !== "activity" && (
        <TranscriptRow key="active-thinking" id="active-thinking">
          <Activity entries={[]} renderTool={renderTool} active />
        </TranscriptRow>
      )}
      {children}
    </>
  );
  return (
    <Container {...(inScroller ? {} : { className: "chat-transcript" })}>
      {turns.map((turn, index) => {
        const content = (
          <>
            {turn.rows}
            {index === turns.length - 1 && trailing}
          </>
        );
        return turn.user ? (
          <TranscriptTurn
            key={turn.id}
            id={turn.id}
            live={index === turns.length - 1}
            header={turn.rows[0]}
            anchor={
              latestUser?.type === "message" &&
              latestUser.message.id === turn.user.id &&
              !historyUsers.current.has(turn.user.id)
            }
          >
            {turn.rows.slice(1)}
            {index === turns.length - 1 && trailing}
          </TranscriptTurn>
        ) : (
          <VirtualTranscriptTurn
            key={turn.id}
            id={turn.id}
            live={index === turns.length - 1}
          >
            {content}
          </VirtualTranscriptTurn>
        );
      })}
      {!turns.length && trailing}
    </Container>
  );
}
