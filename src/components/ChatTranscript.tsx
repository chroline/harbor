import {
  Fragment,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Brain, Check, Paperclip } from "@/lib/icons";
import { Message, MessageContent, MessageFooter } from "./ui/message";
import { Bubble, BubbleContent } from "./ui/bubble";
import { FilePreviewTile } from "./ui/input-message";
import { ThinkingIndicatorGlyph } from "./ui/thinking-indicator";
import { CopyButton, RichText } from "./shared";
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
import { TranscriptRow, useTranscriptScroller } from "./ChatScroller";
import type { TimelineEntry, Tool, RecordedInteraction } from "../lib/protocol";
import "./chat-transcript.css";

function ImageAttachment({ name, mimeType, previewUrl }: { name: string; mimeType: string; previewUrl: string }) {
  const file = useMemo(() => {
    const bytes = Uint8Array.from(atob(previewUrl.slice(previewUrl.indexOf(",") + 1)), (c) => c.charCodeAt(0));
    return new File([bytes], name, { type: mimeType, lastModified: 0 });
  }, [name, mimeType, previewUrl]);
  return <FilePreviewTile file={file} size={80} />;
}

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
}: {
  entries: ActivityEntry[];
  renderTool: (tool: Tool) => ReactNode;
  active?: boolean;
  endedBefore?: number;
  streamingId?: string;
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
  const failed = tools.some((tool) =>
    ["failed", "interrupted"].includes(tool.status),
  );
  const open = expanded ?? (running || failed);
  const duration = activityDuration(entries, endedBefore);
  const heading = running
    ? "Working..."
    : failed
      ? "Needs attention"
      : duration === null
        ? "Worked"
        : `Worked for ${formatWorkDuration(duration)}`;
  return (
    <TraceCollapsible
      className="transcript-activity"
      open={open}
      onOpenChange={setExpanded}
    >
      <TraceCollapsibleTrigger aria-label={heading}>
        <TraceLine status={running ? "running" : failed ? "error" : undefined}>
          {running && (
            <TraceIcon>
              <ThinkingIndicatorGlyph />
            </TraceIcon>
          )}
          <TraceTitle>{heading}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <Trace>
          {entries.map((entry) =>
            entry.type === "tool" ? (
              <TraceStep
                key={entry.tool.id}
                label={entry.tool.title.replaceAll("_", " ")}
                icon={<ToolGlyph kind={entry.tool.kind} />}
                status={traceStatus(
                  entry.tool.status,
                  entry.tool.workCompletedAt !== undefined,
                )}
                description={
                  ["failed", "interrupted"].includes(entry.tool.status)
                    ? entry.tool.status === "failed"
                      ? "Failed"
                      : "Interrupted"
                    : undefined
                }
                detailLabel="View details"
                defaultOpen={["failed", "interrupted"].includes(
                  entry.tool.status,
                )}
              >
                {renderTool(entry.tool)}
              </TraceStep>
            ) : (
              <TraceStep
                key={entry.message.id}
                label={
                  active && entry === entries.at(-1)
                    ? "Reasoning…"
                    : "Reasoning"
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
          {!running && !failed && <TraceStep label="Done" icon={<Check />} />}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
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
  header,
  children,
}: {
  id: string;
  anchor: boolean;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <TranscriptRow id={id} anchor={anchor} user>
      <div className="transcript-prompt-header">{header}</div>
      <div className="transcript-responses">{children}</div>
    </TranscriptRow>
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
  // The scroller considers an unhandled anchor a newly submitted turn, even
  // when an old row merely survives eviction from our bounded transcript.
  // Keep automatic anchoring on the latest live user turn; saved history opens
  // at its restored position and all rows retain stable message IDs.
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
    const final =
      message.role === "assistant" &&
      (!next ||
        (next.type === "message" && next.entry.message.role === "user"));
    const content = (
      <Message
        key={message.id}
        align={message.role === "user" ? "end" : "start"}
        className={`transcript-message transcript-${message.role}${final ? " transcript-final" : ""}`}
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
          <Bubble
            align={message.role === "user" ? "end" : "start"}
            variant={message.role === "user" ? "muted" : "ghost"}
          >
            <BubbleContent
              title={message.role === "user" ? message.text : undefined}
            >
              {(message.label || message.role === "system") && (
                <small className="transcript-message-label">
                  {message.label ?? "Parent relay"}
                </small>
              )}
              {!!message.attachments?.length && (
                <div className="flex flex-wrap gap-2 mb-2" aria-label="Attachments">
                  {message.attachments.map((file, index) => (
                    file.previewUrl && file.mimeType.startsWith("image/") ? (
                      <ImageAttachment
                        key={index}
                        name={file.name}
                        mimeType={file.mimeType}
                        previewUrl={file.previewUrl}
                      />
                    ) : <span key={index} className="inline-flex max-w-full items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs" title={`${file.name} (${Math.ceil(file.size / 1024)} KB)`}>
                      <Paperclip className="size-3 shrink-0" />
                      <span className="truncate">{file.name}</span>
                    </span>
                  ))}
                </div>
              )}
              <RichText text={message.text} commandRanges={message.role === "user" ? message.commandRanges : undefined} streaming={streamingId === message.id} />
            </BubbleContent>
          </Bubble>
          <MessageFooter data-slot="message-actions">
            <CopyButton text={message.text} />
          </MessageFooter>
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
          <Fragment key={turn.id}>{content}</Fragment>
        );
      })}
      {!turns.length && trailing}
    </Container>
  );
}
