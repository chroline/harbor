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

it("positions a long front message so only its first line peeks above the composer", () => {
  const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100);
  const styles = vi.spyOn(window, "getComputedStyle").mockImplementation(() => ({
    paddingTop: "12px", fontSize: "16px", getPropertyValue: () => "1.25rem",
  }) as unknown as CSSStyleDeclaration);
  try {
    const { container } = render(<PromptQueue queue={{ ...queue, items: [queue.items[0]] }} onRemove={() => {}} />);
    const row = container.querySelector<HTMLElement>(".prompt-queue-row")!;
    const list = container.querySelector<HTMLOListElement>("ol")!;
    // The full-height message must slide behind the composer rather than
    // allocating its entire height above it.
    expect(parseFloat(row.style.getPropertyValue("--stack-y"))).toBeLessThan(-40);
    expect(parseFloat(list.style.height)).toBeLessThan(40);
  } finally {
    height.mockRestore();
    styles.mockRestore();
  }
});
