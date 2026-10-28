// @vitest-environment jsdom
import { selectEditor } from "../test/editor";
import { beforeAll, afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { TaskComposer } from "./TaskComposer";
import { EffortChooser } from "./kokonutui/effort-chooser";
import { useState } from "react";
import { createPortal } from "react-dom";
import userEvent from "@testing-library/user-event";
import type { ModePickerProps } from "./ModePicker";
import { chatMode } from "../lib/chat-mode";

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
});
afterEach(cleanup);
const defaults = {
  value: "Inspect the handler",
  onValueChange: () => {},
  context: <span>No workspace</span>,
  modelMenu: <button>Choose model</button>,
  actionLabel: "Send message",
  textareaProps: { "aria-label": "Message" },
};

it("lets mouse clicks select effort in a portalled composer menu", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  render(
    <TaskComposer
      {...defaults}
      onSubmit={() => {}}
      modelMenu={
        <EffortChooser
          value="low"
          options={[
            { value: "low", label: "Low" },
            { value: "high", label: "High" },
          ]}
          onChange={change}
        />
      }
    />,
  );
  await user.click(screen.getByRole("button", { name: "Effort: Low. Change" }));
  const high = screen.getByRole("menuitemradio", { name: "High" });
  // Cancelling mousedown to refocus the editor dismisses the native menu
  // before mouseup can deliver the selection's click in WebKit.
  expect(fireEvent.mouseDown(high, { button: 0 })).toBe(true);
  await user.click(high);
  expect(change).toHaveBeenCalledExactlyOnceWith("high");
});

it("keeps executable configuration open when saving clears the connection error", async () => {
  function ConfigurationAction() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Configure executable</button>
        {open &&
          createPortal(
            <div role="dialog">Connection check result</div>,
            document.body,
          )}
      </>
    );
  }
  const props = (error?: string) => ({
    ...defaults,
    onSubmit: () => {},
    configurationAction: <ConfigurationAction />,
    modePicker: { error, onChange: () => {} },
  });
  const { rerender } = render(
    <TaskComposer {...props("Executable missing")} />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Configure executable" }),
  );
  rerender(<TaskComposer {...props()} />);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("dialog").textContent).toBe(
    "Connection check result",
  );
});

it("sends on Enter and the button, but not on Shift+Enter or during composition", () => {
  const submit = vi.fn();
  render(<TaskComposer {...defaults} onSubmit={submit} />);
  const input = screen.getByRole("textbox");
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(submit).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(submit).toHaveBeenCalledTimes(2);
});

it.each([{ actionDisabled: true }, { busy: true }, { disabled: true }])(
  "blocks keyboard and button submission while unavailable: %j",
  (state) => {
    const submit = vi.fn();
    render(<TaskComposer {...defaults} {...state} onSubmit={submit} />);
    fireEvent.keyDown(screen.getByRole("textbox"), {
      key: "Enter",
      metaKey: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(submit).not.toHaveBeenCalled();
  },
);

it("keeps Stop available during a response without sending another message", () => {
  const submit = vi.fn();
  const stop = vi.fn();
  render(
    <TaskComposer
      {...defaults}
      actionDisabled
      onSubmit={submit}
      onStop={stop}
    />,
  );
  fireEvent.keyDown(screen.getByRole("textbox"), {
    key: "Enter",
    metaKey: true,
  });
  fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  expect(stop).toHaveBeenCalledOnce();
  expect(submit).not.toHaveBeenCalled();
});

function ComposerWithFiles({ disabled = false }: { disabled?: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <TaskComposer
      {...defaults}
      value=""
      files={files}
      onFilesChange={setFiles}
      disabled={disabled}
      onSubmit={vi.fn()}
    />
  );
}

it("opens the file picker, accepts arbitrary files, deduplicates drops, and removes attachments", async () => {
  const { container } = render(<ComposerWithFiles />);
  const input =
    container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const open = vi.spyOn(input, "click");
  fireEvent.click(screen.getByRole("button", { name: "Attach files" }));
  expect(open).toHaveBeenCalledOnce();
  const file = new File(["hello"], "notes.txt", { type: "text/plain" });
  fireEvent.change(input, { target: { files: [file] } });
  expect(screen.getByRole("button", { name: "Remove notes.txt" })).toBeTruthy();
  const composer = container.querySelector(".task-composer")!;
  const transfer = { files: [file], types: ["Files"], dropEffect: "none" };
  fireEvent.dragOver(composer, { dataTransfer: transfer });
  expect(screen.getByText("Drop files to attach").getAttribute("role")).toBe(
    "status",
  );
  fireEvent.drop(screen.getByRole("textbox"), { dataTransfer: transfer });
  expect(
    screen.getAllByRole("button", { name: "Remove notes.txt" }),
  ).toHaveLength(1);
  expect(screen.queryByText("Drop files to attach")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove notes.txt" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Remove notes.txt" }),
    ).toBeNull(),
  );
});

it("accepts pasted files and gives feedback without discarding the existing batch when over the limit", () => {
  render(<ComposerWithFiles />);
  fireEvent.paste(screen.getByRole("textbox"), {
    clipboardData: { files: [new File(["hello"], "pasted.txt")] },
  });
  expect(
    screen.getByRole("button", { name: "Remove pasted.txt" }),
  ).toBeTruthy();
  fireEvent.drop(screen.getByRole("textbox"), {
    dataTransfer: {
      types: ["Files"],
      files: Array.from({ length: 10 }, (_, i) => new File([], `${i}.txt`)),
    },
  });
  expect(screen.getByRole("alert").textContent).toContain("up to 10");
  expect(
    screen.getByRole("button", { name: "Remove pasted.txt" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Remove 0.txt" })).toBeNull();
});

it("ignores file drops when disabled", () => {
  render(<ComposerWithFiles disabled />);
  expect(
    (screen.getByRole("button", { name: "Attach files" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.drop(screen.getByRole("textbox"), {
    dataTransfer: { types: ["Files"], files: [new File([], "blocked.txt")] },
  });
  expect(
    screen.queryByRole("button", { name: "Remove blocked.txt" }),
  ).toBeNull();
});

const mode = {
  configId: "mode",
  current: "agent",
  choices: ["agent", "plan", "ask"].map((value) => ({
    value,
    name: value[0].toUpperCase() + value.slice(1),
  })),
};
function ComposerWithMode({
  overrides = {},
}: {
  overrides?: Partial<ModePickerProps>;
}) {
  const [selected, setSelected] = useState("agent");
  return (
    <TaskComposer
      {...defaults}
      onSubmit={vi.fn()}
      modePicker={{ mode, selected, onChange: setSelected, ...overrides }}
    />
  );
}

it("cycles from the focused input while preserving draft, caret, and focus", async () => {
  const user = userEvent.setup();
  render(<ComposerWithMode />);
  const input = screen.getByRole("textbox") as HTMLTextAreaElement;
  input.focus();
  selectEditor(input, 3, 7);
  for (const label of ["Plan", "Ask", "Agent"]) {
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: `Mode: ${label}` })).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect(input.textContent).toBe(defaults.value);
    expect(window.getSelection()?.toString()).toBe(defaults.value.slice(3, 7));
  }
});

it("shows the provider's current mode and switches it with Shift+Tab or the menu", async () => {
  const user = userEvent.setup();
  function ProviderModeComposer() {
    const [currentValue, setMode] = useState("build");
    const mode = chatMode([
      {
        id: "mode",
        category: "mode",
        type: "select",
        name: "Session Mode",
        currentValue,
        options: ["build", "plan"].map((value) => ({ value, name: value })),
      },
    ]);
    return (
      <TaskComposer
        {...defaults}
        onSubmit={vi.fn()}
        modePicker={{ mode, onChange: setMode }}
      />
    );
  }
  render(<ProviderModeComposer />);
  expect(screen.getByRole("button", { name: "Mode: build" })).toBeTruthy();
  const input = screen.getByRole("textbox");
  input.focus();
  await user.keyboard("{Shift>}{Tab}{/Shift}");
  expect(document.activeElement).toBe(input);
  await user.click(screen.getByRole("button", { name: "Mode: plan" }));
  expect(
    screen
      .getByRole("menuitemradio", { name: "plan" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  await user.click(screen.getByRole("menuitemradio", { name: "build" }));
  expect(screen.getByRole("button", { name: "Mode: build" })).toBeTruthy();
});

it("offers a checked, clickable mode menu and a next-turn indicator", async () => {
  const user = userEvent.setup();
  render(<ComposerWithMode overrides={{ nextTurn: true }} />);
  await user.click(
    screen.getByRole("button", { name: "Mode: Agent (next turn)" }),
  );
  expect(
    screen
      .getByRole("menuitemradio", { name: "Agent" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  await user.click(screen.getByRole("menuitemradio", { name: "Plan" }));
  expect(
    screen.getByRole("button", { name: "Mode: Plan (next turn)" }),
  ).toBeTruthy();
});

it("does not intercept other modifiers, IME, ordinary Tab, or keys outside the textarea", () => {
  const change = vi.fn();
  render(<ComposerWithMode overrides={{ onChange: change }} />);
  const input = screen.getByRole("textbox");
  for (const modifiers of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { isComposing: true },
  ]) {
    expect(
      fireEvent.keyDown(input, { key: "Tab", shiftKey: true, ...modifiers }),
    ).toBe(true);
  }
  expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(true);
  expect(
    fireEvent.keyDown(screen.getByRole("button", { name: "Choose model" }), {
      key: "Tab",
      shiftKey: true,
    }),
  ).toBe(true);
  fireEvent.keyDown(input, { key: "Tab", shiftKey: true, repeat: true });
  expect(change).not.toHaveBeenCalled();
});

it("allows mode selection in the read-only input during a response without interrupting Stop", () => {
  const change = vi.fn();
  const stop = vi.fn();
  render(
    <TaskComposer
      {...defaults}
      textareaProps={{ readOnly: true }}
      onSubmit={vi.fn()}
      onStop={stop}
      modePicker={{ mode, onChange: change }}
    />,
  );
  fireEvent.keyDown(screen.getByRole("textbox"), {
    key: "Tab",
    shiftKey: true,
  });
  expect(change).toHaveBeenCalledWith("plan");
  fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  expect(stop).toHaveBeenCalledOnce();
});

it("preserves backward tab navigation when mode switching is unavailable", () => {
  const change = vi.fn();
  render(<ComposerWithMode overrides={{ disabled: true, onChange: change }} />);
  expect(
    fireEvent.keyDown(screen.getByRole("textbox"), {
      key: "Tab",
      shiftKey: true,
    }),
  ).toBe(true);
  expect(change).not.toHaveBeenCalled();
});

it("queues with Enter and steers with Cmd+Enter while retaining Stop", () => {
  const submit = vi.fn();
  const stop = vi.fn();
  render(
    <TaskComposer
      {...defaults}
      value="Change course"
      onSubmit={submit}
      onStop={stop}
      actionLabel="Queue message"
    />,
  );
  const input = screen.getByRole("textbox");
  expect(input.getAttribute("contenteditable")).toBe("true");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(submit).toHaveBeenLastCalledWith("send");
  fireEvent.keyDown(input, { key: "Enter", metaKey: true });
  expect(submit).toHaveBeenLastCalledWith("steer");
  fireEvent.click(screen.getByRole("button", { name: "Queue message" }));
  expect(submit).toHaveBeenLastCalledWith("send");
  fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  expect(stop).toHaveBeenCalledOnce();
});

it("accepts attachments while a response is running", () => {
  const files = vi.fn();
  render(
    <TaskComposer
      {...defaults}
      files={[]}
      onFilesChange={files}
      onStop={vi.fn()}
      onSubmit={vi.fn()}
    />,
  );
  const file = new File(["notes"], "steering.md", { type: "text/markdown" });
  fireEvent.drop(screen.getByRole("textbox"), {
    dataTransfer: { types: ["Files"], files: [file] },
  });
  expect(files).toHaveBeenCalledWith([file]);
});
