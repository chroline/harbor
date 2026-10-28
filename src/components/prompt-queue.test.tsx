// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptQueue } from "./PromptQueue";
import type { QueueSnapshot } from "../lib/bindings/QueueSnapshot";

beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(cleanup);
const queue: QueueSnapshot = { sessionId: "chat", childId: null, revision: 1, paused: false, steering: false, error: null, items: [
  { id: "a", text: "First", attachments: [], intent: "send", editing: false },
  { id: "b", text: "Second", attachments: ["notes.md"], intent: "send", editing: true },
] };
it("exposes edit and steer actions and identifies the message being edited", () => {
  const edit = vi.fn(), steer = vi.fn(), remove = vi.fn();
  render(<PromptQueue queue={queue} onEdit={edit} onSteer={steer} onRemove={remove} editing={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit queued message: First" }));
  fireEvent.click(screen.getByRole("button", { name: "Steer with queued message: First" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove queued message: First" }));
  expect(edit).toHaveBeenCalledWith("a");
  expect(steer).toHaveBeenCalledWith("a");
  expect(remove).toHaveBeenCalledWith("a");
  expect(screen.getByText("Editing")).toBeTruthy();
  expect(screen.getByText(/notes\.md/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit queued message: Second" })).toBeNull();
});
