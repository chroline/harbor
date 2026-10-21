// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MotionConfig } from "framer-motion";
import { InputMessage } from "./ui/input-message";
import { ThinkingIndicator } from "./ui/thinking-indicator";
import {
  ThinkingSteps,
  ThinkingStepsContent,
  ThinkingStep,
} from "./ui/thinking-steps";
import { TabsSubtle, TabsSubtleItem } from "./ui/tabs-subtle";
import { Field, Disclosure } from "./fluid";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes("reduced-motion"),
    media: query,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }));
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
const wrap = (node: React.ReactNode) => (
  <MotionConfig reducedMotion="always">{node}</MotionConfig>
);

describe("Fluid behavior adapters", () => {
  it("submits a setup composer exactly once inside a dialog shortcut handler", () => {
    const send = vi.fn();
    const dialogShortcut = vi.fn();
    render(
      wrap(
        <div onKeyDown={dialogShortcut}>
          <InputMessage
            value="Inspect retries"
            onValueChange={() => {}}
            onSend={send}
            submitOn="mod-enter"
            textareaProps={{ "aria-label": "Task" }}
          />
        </div>,
      ),
    );
    const input = screen.getByRole("textbox", { name: "Task" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(send).not.toHaveBeenCalled();
    dialogShortcut.mockClear();
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(dialogShortcut).not.toHaveBeenCalled();
    expect(send.mock.calls[0][0]).toBe("Inspect retries");
  });

  it("keeps Shift+Enter and IME composition from sending a chat message", () => {
    const send = vi.fn();
    render(
      wrap(
        <InputMessage
          value="Next step"
          onValueChange={() => {}}
          onSend={send}
        />,
      ),
    );
    const input = screen.getByRole("textbox", { name: "Message" });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(send).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not hide a provider's pending plan or invent rotating activity", () => {
    render(
      wrap(
        <>
          <ThinkingIndicator label="Waiting for your response" />
          <ThinkingSteps open>
            <ThinkingStepsContent>
              <ThinkingStep
                status="complete"
                description="pending"
                label="Run the test suite"
              />
            </ThinkingStepsContent>
          </ThinkingSteps>
        </>,
      ),
    );
    expect(screen.getByText("Run the test suite")).toBeTruthy();
    expect(
      screen.getAllByText("Waiting for your response").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Moonwalking")).toBeNull();
  });

  it("keeps unverified terminal mode disabled", () => {
    const select = vi.fn();
    render(
      wrap(
        <TabsSubtle selectedIndex={0} onSelect={select}>
          <TabsSubtleItem index={0} label="Chat" />
          <TabsSubtleItem index={1} label="Terminal" disabled />
        </TabsSubtle>,
      ),
    );
    const terminal = screen.getByRole("tab", {
      name: "Terminal",
    }) as HTMLButtonElement;
    expect(terminal.disabled).toBe(true);
    fireEvent.click(terminal);
    expect(select).not.toHaveBeenCalled();
  });

  it("opens an uncontrolled disclosure without swallowing its state change", () => {
    render(
      wrap(
        <Disclosure title="Subagents">
          <button>Worker report</button>
        </Disclosure>,
      ),
    );
    const trigger = screen.getByRole("button", { name: "Subagents" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Worker report" })).toBeTruthy();
  });

  it("passes field edits and blur through the real input", () => {
    const change = vi.fn();
    const blur = vi.fn();
    render(
      wrap(
        <Field
          aria-label="Editor"
          defaultValue="code"
          onValueChange={change}
          onBlur={blur}
        />,
      ),
    );
    const input = screen.getByRole("textbox", { name: "Editor" });
    fireEvent.change(input, { target: { value: "cursor" } });
    fireEvent.blur(input);
    expect(change).toHaveBeenCalledWith("cursor");
    expect(blur).toHaveBeenCalledTimes(1);
    expect((input as HTMLInputElement).value).toBe("cursor");
  });
});
