// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { HomeDashboard, shortAgo } from "./HomeDashboard";
import type { SessionRecord } from "../lib/bindings/SessionRecord";
import type { Workspace } from "../lib/bindings/Workspace";

afterEach(cleanup);

const now = Date.now();
const session = (id: string, status: string, extra: Partial<SessionRecord> = {}) =>
  ({
    id,
    status,
    title: `Task ${id}`,
    providerId: "codex",
    workspaceId: "w1",
    updatedAt: now - 60_000,
    isOrchestrator: false,
    parentSessionId: null,
    ...extra,
  }) as SessionRecord;
const workspaces = [
  { id: "w1", name: "harbor", lastUsedAt: now - 3_600_000, available: true },
  { id: "w2", name: "old", lastUsedAt: now - 86_400_000 * 3, available: true },
  { id: "w3", name: "gone", lastUsedAt: now, available: false },
] as Workspace[];

it("formats short ages", () => {
  expect(shortAgo(now, now)).toBe("now");
  expect(shortAgo(now - 5 * 60_000, now)).toBe("5m");
  expect(shortAgo(now - 3 * 3_600_000, now)).toBe("3h");
  expect(shortAgo(now - 2 * 86_400_000, now)).toBe("2d");
});

it("sorts conversations into the right cards and opens them", () => {
  const open = vi.fn();
  const newTask = vi.fn();
  render(
    <HomeDashboard
      sessions={[
        session("ask", "needs_input"),
        session("busy", "working"),
        session("done", "completed"),
        session("worker", "working", { parentSessionId: "busy" }),
      ]}
      workspaces={workspaces}
      onOpenSession={open}
      onNewTask={newTask}
    />,
  );
  const card = (name: string) => within(screen.getByRole("region", { name }));
  expect(card("Needs you").getByText("Task ask")).toBeTruthy();
  expect(card("Working now").getByText("Task busy")).toBeTruthy();
  // Workers belong to their parent, not the glance.
  expect(screen.queryByText("Task worker")).toBeNull();
  expect(card("Recently finished").getByText("Task done")).toBeTruthy();
  fireEvent.click(card("Needs you").getByRole("button", { name: "Open Task ask" }));
  expect(open).toHaveBeenCalledWith("ask");
  // Unavailable folders are skipped; newest first.
  const recent = card("Recent workspaces");
  expect(recent.queryByRole("button", { name: "New task in gone" })).toBeNull();
  fireEvent.click(recent.getByRole("button", { name: "New task in harbor" }));
  expect(newTask).toHaveBeenCalledWith("w1");
});

it("shows an empty state in each card", () => {
  render(
    <HomeDashboard sessions={[]} workspaces={[]} onOpenSession={vi.fn()} onNewTask={vi.fn()} />,
  );
  for (const text of ["Nothing needs you", "No agent is working", "Nothing finished yet", "No workspaces yet"])
    expect(screen.getByText(text)).toBeTruthy();
});
