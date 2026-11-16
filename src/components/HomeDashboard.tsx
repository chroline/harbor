import type { ReactNode } from "react";
import Balancer from "react-wrap-balancer";
import { rem } from "@/lib/units";
import { Bolt, CheckCheck, CircleAlert, Folder } from "@/lib/icons";
import { ProviderIcon, SpinnerIcon } from "./shared";
import { sessionNeedsAttention } from "../lib/protocol";
import type { SessionRecord } from "../lib/bindings/SessionRecord";
import type { Workspace } from "../lib/bindings/Workspace";

const ROWS = 5;

/** "now", "5m", "3h", "2d": one short token, sized for a row's right edge. */
export function shortAgo(since: number, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - since) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

type Tone = "attention" | "working" | "success" | "neutral";

function Card({
  icon,
  tone,
  title,
  count,
  empty,
  children,
}: {
  icon: ReactNode;
  /** Colors the header icon. */
  tone: Tone;
  title: string;
  count?: number;
  empty: { title: string; text: string };
  children: ReactNode[];
}) {
  return (
    <section className="home-card" aria-label={title}>
      <header className="home-card-header">
        <span className="home-card-icon" data-tone={tone}>
          {icon}
        </span>
        <h2>{title}</h2>
        {!!count && <span className="home-card-count">{count}</span>}
      </header>
      {children.length ? (
        <ul className="home-card-list">{children}</ul>
      ) : (
        <div className="home-card-empty">
          <strong>
            <Balancer>{empty.title}</Balancer>
          </strong>
          <span>
            <Balancer>{empty.text}</Balancer>
          </span>
        </div>
      )}
    </section>
  );
}

function SessionRow({
  session,
  place,
  trailing,
  onOpen,
}: {
  session: SessionRecord;
  place: string;
  trailing?: ReactNode;
  onOpen: (id: string) => void;
}) {
  return (
    <li>
      <button
        className="home-row"
        aria-label={`Open ${session.title || "conversation"}`}
        onClick={() => onOpen(session.id)}
      >
        <ProviderIcon id={session.providerId} size={rem(16)} />
        <span className="home-row-title">{session.title || "New conversation"}</span>
        <span className="home-row-meta">{place}</span>
        <span className="home-row-time">
          {trailing ?? shortAgo(session.updatedAt)}
        </span>
      </button>
    </li>
  );
}

/** At-a-glance state of every conversation, under the new-task composer. */
export function HomeDashboard({
  sessions,
  workspaces,
  onOpenSession,
  onNewTask,
}: {
  /** Non-archived conversations. */
  sessions: SessionRecord[];
  workspaces: Workspace[];
  onOpenSession: (id: string) => void;
  /** Start a task in this workspace ("" is no workspace). */
  onNewTask: (workspaceId: string) => void;
}) {
  const place = (s: SessionRecord) =>
    workspaces.find((w) => w.id === s.workspaceId)?.name ?? "No workspace";
  const newest = (a: SessionRecord, b: SessionRecord) => b.updatedAt - a.updatedAt;
  const top = sessions.filter((s) => !s.isOrchestrator && !s.parentSessionId);

  const needs = sessions
    .filter((s) => sessionNeedsAttention(s.status))
    .sort(newest);
  const working = top
    .filter((s) => ["working", "connecting"].includes(s.status))
    .sort(newest);
  const finished = top
    .filter((s) => ["completed", "idle"].includes(s.status))
    .sort(newest);
  const recent = [...workspaces]
    .filter((w) => w.available)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, ROWS);

  return (
    <div className="home-dashboard">
      <Card
        icon={<CircleAlert size={rem(16)} />}
        tone="attention"
        title="Needs you"
        count={needs.length}
        empty={{
          title: "Nothing needs you",
          text: "An agent that asks for a permission or an answer shows here first.",
        }}
      >
        {needs.slice(0, ROWS).map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            place={place(s)}
            onOpen={onOpenSession}
            trailing={
              <span className="home-row-status" data-tone={s.status === "error" ? "danger" : "warning"}>
                {s.status === "error" ? "Interrupted" : s.status === "cleanup_pending" ? "Cleanup" : "Waiting"}
              </span>
            }
          />
        ))}
      </Card>
      <Card
        icon={<Bolt size={rem(16)} />}
        tone="working"
        title="Working now"
        count={working.length}
        empty={{
          title: "No agent is working",
          text: "Describe a task above and an agent starts on it.",
        }}
      >
        {working.slice(0, ROWS).map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            place={place(s)}
            onOpen={onOpenSession}
            trailing={<SpinnerIcon size={rem(14)} />}
          />
        ))}
      </Card>
      <Card
        icon={<CheckCheck size={rem(16)} />}
        tone="success"
        title="Recently finished"
        count={finished.length}
        empty={{
          title: "Nothing finished yet",
          text: "Conversations that complete a turn collect here.",
        }}
      >
        {finished.slice(0, ROWS).map((s) => (
          <SessionRow key={s.id} session={s} place={place(s)} onOpen={onOpenSession} />
        ))}
      </Card>
      <Card
        icon={<Folder size={rem(16)} />}
        tone="neutral"
        title="Recent workspaces"
        empty={{
          title: "No workspaces yet",
          text: "Add a folder from the workspace picker to see it here.",
        }}
      >
        {recent.map((w) => (
          <li key={w.id}>
            <button
              className="home-row"
              aria-label={`New task in ${w.name}`}
              onClick={() => onNewTask(w.id)}
            >
              <Folder size={rem(16)} className="home-row-icon" />
              <span className="home-row-title">{w.name}</span>
              <span className="home-row-time">
                {w.lastUsedAt ? shortAgo(w.lastUsedAt) : ""}
              </span>
            </button>
          </li>
        ))}
      </Card>
    </div>
  );
}
