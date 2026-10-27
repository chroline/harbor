// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import {
  UNSEEN_TURNS_KEY,
  applySessionStatuses,
  noteFinishedTurn,
  useUnseenTurns,
} from "./unseen-turns";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../components/ui/sidebar";

afterEach(() => {
  cleanup();
  localStorage.removeItem(UNSEEN_TURNS_KEY);
});

it("marks a turn that finishes out of view and clears it when the chat is opened", () => {
  const previous = new Map([["a", "working"]]);
  const finished = applySessionStatuses(
    new Set(),
    previous,
    [{ id: "a", status: "completed" }],
    undefined,
  );
  expect([...finished.unseen]).toEqual(["a"]);

  const watching = applySessionStatuses(
    new Set(),
    previous,
    [{ id: "a", status: "completed" }],
    "a",
  );
  expect([...watching.unseen]).toEqual([]);

  const opened = applySessionStatuses(
    finished.unseen,
    finished.previous,
    [{ id: "a", status: "completed" }],
    "a",
  );
  expect([...opened.unseen]).toEqual([]);

  const stayed = applySessionStatuses(
    opened.unseen,
    opened.previous,
    [{ id: "a", status: "completed" }],
    undefined,
  );
  expect([...stayed.unseen]).toEqual([]);
});

it("does not treat chats that were already finished at startup as unread", () => {
  const applied = applySessionStatuses(
    new Set(),
    new Map(),
    [{ id: "old", status: "completed" }],
    undefined,
  );
  expect([...applied.unseen]).toEqual([]);
});

it("keeps a worker finish unread until that chat is open", () => {
  expect([...noteFinishedTurn(new Set(), "parent", undefined)]).toEqual([
    "parent",
  ]);
  expect(noteFinishedTurn(new Set(), "parent", "parent").size).toBe(0);
});

it("remembers an unseen finish across a remount and shows a blue dot until opened", () => {
  localStorage.setItem(UNSEEN_TURNS_KEY, JSON.stringify(["kept"]));
  const { result, rerender, unmount } = renderHook(
    ({
      sessions,
      activeId,
    }: {
      sessions: { id: string; status: string }[];
      activeId?: string;
    }) => useUnseenTurns(sessions, activeId),
    {
      initialProps: {
        sessions: [{ id: "kept", status: "idle" }],
        activeId: undefined as string | undefined,
      },
    },
  );
  expect(result.current.has("kept")).toBe(true);
  rerender({
    sessions: [{ id: "kept", status: "idle" }],
    activeId: "kept",
  });
  expect(result.current.has("kept")).toBe(false);
  unmount();

  function Harness() {
    const [status, setStatus] = useState("working");
    const [activeId, setActiveId] = useState<string | undefined>();
    const unseen = useUnseenTurns([{ id: "chat", status }], activeId);
    return (
      <>
        <button onClick={() => setStatus("completed")}>Finish</button>
        <button onClick={() => setActiveId("chat")}>Open</button>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton unseen={unseen.has("chat") ? "Unread" : undefined}>
              Finished chat
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </>
    );
  }
  render(<Harness />);
  expect(
    screen.getByRole("button", { name: "Finished chat" }).querySelector(
      '[data-sidebar="menu-status"]',
    ),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  const row = screen.getByRole("button", { name: /Finished chat,\s*Unread/ });
  expect(
    row.querySelector('[data-state="unseen"][data-tone="info"]'),
  ).toBeTruthy();
  expect(row.querySelector(".bg-info")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  expect(
    screen.getByRole("button", { name: "Finished chat" }).querySelector(
      '[data-sidebar="menu-status"]',
    ),
  ).toBeNull();
});
