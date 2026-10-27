// @vitest-environment jsdom
import { beforeAll, afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MotionConfig } from "framer-motion";
import userEvent from "@testing-library/user-event";
import { ModelMenu, EffortControl, DiscoveryModelMenu } from "./ModelMenu";
import { ModePicker } from "./ModePicker";
import { chatMode } from "../lib/chat-mode";
import type { ConfigOption } from "../lib/protocol";
vi.mock("../lib/store", () => ({
  useStore: () => ({
    data: {
      providers: [
        { id: "codex", name: "Codex" },
        { id: "claude", name: "Claude" },
      ],
    },
  }),
}));
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
    matches: true,
    media: query,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }));
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(cleanup);
const controls: ConfigOption[] = [
  {
    id: "provider-model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "fast-id",
    options: [
      { value: "fast-id", name: "Fast" },
      { value: "deep-id", name: "Deep" },
    ],
  },
  {
    id: "thinking",
    name: "Reasoning effort",
    category: "thought_level",
    type: "select",
    currentValue: "low-id",
    options: [
      { value: "low-id", name: "Low" },
      { value: "high-id", name: "High" },
    ],
  },
];
it("searches real model names and sends exact provider config IDs", async () => {
  const change = vi.fn();
  render(
    <MotionConfig reducedMotion="always">
      <ModelMenu provider="codex" controls={controls} onChange={change} />
    </MotionConfig>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Choose model and reasoning" }),
  );
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Choose model" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search models" }), {
    target: { value: "deep" },
  });
  expect(screen.queryByRole("button", { name: "Fast" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Deep" }));
  expect(change).toHaveBeenCalledWith("provider-model", "deep-id");
  await userEvent.click(
    screen.getByRole("button", { name: "Effort: Low. Change" }),
  );
  await userEvent.click(screen.getByRole("menuitemradio", { name: /^High/ }));
  expect(change).toHaveBeenCalledWith("thinking", "high-id");
});
it("refreshes dependent efforts and prevents changes while loading", async () => {
  const change = vi.fn();
  const ui = (opts: ConfigOption[], busy = false) => (
    <MotionConfig reducedMotion="always">
      <ModelMenu
        provider="codex"
        controls={opts}
        busy={busy}
        onChange={change}
      />
    </MotionConfig>
  );
  const { rerender } = render(ui(controls));
  fireEvent.click(
    screen.getByRole("button", { name: "Choose model and reasoning" }),
  );
  await screen.findByRole("dialog");
  const next = [
    { ...controls[0], currentValue: "deep-id" },
    {
      ...controls[1],
      currentValue: "high-id",
      options: [{ value: "high-id", name: "High" }],
    },
  ];
  rerender(ui(next, true));
  expect(
    (
      screen.getByRole("button", {
        name: "Effort: High. Change",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Choose model" }));
  expect(change).not.toHaveBeenCalled();
  expect(screen.queryByText("Full access")).toBeNull();
});

it("selects advertised efforts and does not emit when choosing the current level", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  render(<EffortControl option={controls[1]} onChange={change} />);
  await user.click(screen.getByRole("button", { name: "Effort: Low. Change" }));
  expect(
    screen
      .getByRole("menuitemradio", { name: /^Low/ })
      .getAttribute("aria-checked"),
  ).toBe("true");
  await user.click(screen.getByRole("menuitemradio", { name: /^Low/ }));
  expect(change).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Effort: Low. Change" }));
  await user.click(screen.getByRole("menuitemradio", { name: /^High/ }));
  expect(change).toHaveBeenCalledExactlyOnceWith("high-id");
});

it("uses effort names and descriptions exactly as advertised without supplying missing descriptions", async () => {
  const user = userEvent.setup();
  render(
    <EffortControl
      option={{
        ...controls[1],
        currentValue: "custom",
        options: [
          {
            value: "custom",
            name: "Thinking: Custom",
            description: "Agent-provided effort details",
          },
          { value: "high", name: "High" },
        ],
      }}
      onChange={vi.fn()}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Effort: Thinking: Custom. Change" }),
  );
  expect(
    screen.getByRole("menuitemradio", { name: "Thinking: Custom" }),
  ).toBeTruthy();
  expect(screen.getByText("Agent-provided effort details")).toBeTruthy();
  expect(screen.queryByText("Thinks longer on hard problems")).toBeNull();
});

it("selects effort after dismissing the agent picker without choosing an agent", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  render(
    <>
      <button>Outside</button>
      <ModelMenu
        provider="codex"
        controls={controls}
        onChange={change}
        onProviderChange={vi.fn()}
      />
    </>,
  );
  await user.click(screen.getByRole("button", { name: "Choose model and reasoning" }));
  await user.click(screen.getByRole("button", { name: "Choose model" }));
  await user.click(screen.getByRole("button", { name: "Choose agent" }));
  await user.click(screen.getByRole("button", { name: "Outside" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await user.click(screen.getByRole("button", { name: "Effort: Low. Change" }));
  await user.click(screen.getByRole("menuitemradio", { name: "High" }));
  expect(change).toHaveBeenCalledExactlyOnceWith("thinking", "high-id");
});
it("renders only provider permission choices and preserves their values", async () => {
  const change = vi.fn();
  const permission: ConfigOption = {
    id: "approval-policy",
    category: "mode",
    name: "Permissions",
    type: "select",
    currentValue: "ask-id",
    options: [
      { value: "ask-id", name: "Ask each time" },
      { value: "edit-id", name: "Accept edits" },
    ],
  };
  render(
    <MotionConfig reducedMotion="always">
      <ModelMenu
        provider="codex"
        controls={[
          ...controls,
          permission,
          {
            id: "collaboration_mode",
            name: "Collaboration",
            type: "select",
            currentValue: "default",
            options: [
              { value: "default", name: "Default" },
              { value: "plan", name: "Plan" },
            ],
          },
        ]}
        onChange={change}
      />
    </MotionConfig>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Choose model and reasoning" }),
  );
  await screen.findByRole("dialog");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Accept edits" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(change).toHaveBeenCalledWith("approval-policy", "edit-id");
  expect(screen.queryByRole("tab", { name: "Full access" })).toBeNull();
});

it("navigates agents within the same dialog and restores search and focus", async () => {
  const providerChange = vi.fn();
  render(
    <ModelMenu
      provider="codex"
      controls={controls}
      onChange={vi.fn()}
      onProviderChange={providerChange}
    />,
  );
  const trigger = screen.getByRole("button", {
    name: "Choose model and reasoning",
  });
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Choose model" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search models" }), {
    target: { value: "deep" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Choose agent" }));
  expect(screen.getAllByRole("dialog")).toEqual([dialog]);
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Search models" })).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Codex" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Claude" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Choose agent" }),
  );
  expect(
    (screen.getByRole("textbox", { name: "Search models" }) as HTMLInputElement)
      .value,
  ).toBe("deep");
  fireEvent.click(screen.getByRole("button", { name: "Choose agent" }));
  fireEvent.click(screen.getByRole("button", { name: "Codex" }));
  expect(providerChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Choose agent" }));
  fireEvent.click(screen.getByRole("button", { name: "Claude" }));
  expect(providerChange).toHaveBeenCalledExactlyOnceWith("claude");
  expect(screen.getByRole("dialog")).toBe(dialog);
  const search = screen.getByRole("textbox", { name: "Search models" });
  expect(document.activeElement).toBe(search);
  expect((search as HTMLInputElement).value).toBe("");
  fireEvent.keyDown(search, { key: "Escape" });
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Choose model" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it("backs out without changing the provider and resets navigation on reopen", async () => {
  const providerChange = vi.fn();
  render(
    <ModelMenu
      provider="codex"
      controls={controls}
      onChange={vi.fn()}
      onProviderChange={providerChange}
    />,
  );
  const trigger = screen.getByRole("button", {
    name: "Choose model and reasoning",
  });
  fireEvent.click(trigger);
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Choose model" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose agent" }));
  fireEvent.click(screen.getByRole("button", { name: "Back to models" }));
  expect(providerChange).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Choose agent" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose agent" }));
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(trigger);
  expect(screen.queryByRole("textbox", { name: "Search models" })).toBeNull();
  expect(screen.getByRole("button", { name: "Choose model" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Back to models" })).toBeNull();
});

it("allows switching away from a loading provider and shows retry states", async () => {
  const providerChange = vi.fn();
  const retry = vi.fn();
  const ui = (provider: string, busy: boolean, error?: string) => (
    <ModelMenu
      provider={provider}
      controls={[]}
      busy={busy}
      error={error}
      retry={retry}
      onChange={vi.fn()}
      onProviderChange={providerChange}
    />
  );
  const { rerender } = render(ui("codex", false));
  fireEvent.click(
    screen.getByRole("button", { name: "Choose model and reasoning" }),
  );
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Choose model" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose agent" }));
  rerender(ui("codex", true));
  fireEvent.click(screen.getByRole("button", { name: "Claude" }));
  expect(providerChange).toHaveBeenCalledWith("claude");
  expect(screen.getByText("Loading models…")).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Choose agent" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  rerender(ui("claude", false, "Discovery failed"));
  expect(screen.getByRole("alert").textContent).toContain("Discovery failed");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.getByText("No models available")).toBeTruthy();
});

it("dismisses the agent view on an outside click and reopens on reasoning", async () => {
  const user = userEvent.setup();
  render(
    <>
      <button>Outside</button>
      <ModelMenu
        provider="codex"
        controls={controls}
        onChange={vi.fn()}
        onProviderChange={vi.fn()}
      />
    </>,
  );
  await user.click(
    screen.getByRole("button", { name: "Choose model and reasoning" }),
  );
  await user.click(screen.getByRole("button", { name: "Choose model" }));
  await user.click(screen.getByRole("button", { name: "Choose agent" }));
  const inactive = document.querySelector(
    '.model-menu-view[data-active="false"]',
  );
  expect(inactive?.hasAttribute("inert")).toBe(true);
  expect(inactive?.getAttribute("aria-hidden")).toBe("true");
  await user.click(screen.getByRole("button", { name: "Outside" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await user.click(
    screen.getByRole("button", { name: "Choose model and reasoning" }),
  );
  expect(screen.queryByRole("textbox", { name: "Search models" })).toBeNull();
  expect(screen.getByRole("button", { name: "Choose model" })).toBeTruthy();
});

it("keeps session-only pickers on models without an agent navigation control", async () => {
  render(<ModelMenu provider="codex" controls={controls} onChange={vi.fn()} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Choose model and reasoning" }),
  );
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Choose model" }));
  expect(screen.queryByRole("button", { name: "Choose agent" })).toBeNull();
  expect(screen.queryByRole("group", { name: "Available agents" })).toBeNull();
  expect(screen.getByRole("button", { name: "Fast" })).toBeTruthy();
});

it("shows one reasoning control when legacy modes duplicate the same setting", async () => {
  const change = vi.fn();
  const modes = {
    // Legacy snapshots may lag behind the config API after a change.
    currentModeId: "high-id",
    availableModes: [
      { id: "low-id", name: "Low" },
      { id: "high-id", name: "High" },
    ],
  };
  render(
    <ModelMenu
      provider="codex"
      controls={controls}
      modes={modes}
      onChange={change}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Choose model and reasoning" }),
  );
  await screen.findByRole("dialog");
  expect(screen.queryByRole("radiogroup", { name: "Mode" })).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Effort: Low. Change" }),
  );
  await userEvent.click(screen.getByRole("menuitemradio", { name: /^High/ }));
  expect(change).toHaveBeenCalledWith("thinking", "high-id");
});

it("promotes legacy modes to the composer for an unknown provider without duplicating them", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  const modes = {
    currentModeId: "plan",
    availableModes: [
      { id: "plan", name: "Plan" },
      { id: "act", name: "Act" },
    ],
  };
  const mode = chatMode(controls, modes)!;
  render(
    <>
      <ModePicker
        mode={mode}
        onChange={(value) => change(mode.configId, value)}
      />
      <ModelMenu
        provider="new-custom-provider"
        controls={controls}
        modes={modes}
        onChange={change}
      />
    </>,
  );
  await user.click(screen.getByRole("button", { name: "Mode: Plan" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Act" }));
  expect(change).toHaveBeenCalledWith("__legacy_mode", "act");
  await user.click(
    screen.getByRole("button", { name: "Choose model and reasoning" }),
  );
  expect(screen.queryByRole("tab", { name: "Act" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Effort: Low. Change" }),
  ).toBeTruthy();
  await user.keyboard("{Escape}");
});

it("keeps model navigation while offering the effort chooser beside it", async () => {
  const change = vi.fn();
  render(<ModelMenu provider="codex" controls={controls} onChange={change} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Choose model and reasoning" }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(
    screen.getByRole("button", { name: "Effort: Low. Change" }),
  ).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Search models" })).toBeNull();
  const label = screen.getByRole("button", { name: "Choose model" });
  expect(label.textContent).not.toContain("Low");
  expect(label.textContent).toContain("Codex");
  expect(screen.queryByRole("button", { name: /Reset reasoning/ })).toBeNull();
  expect(label.textContent).toContain("Fast");
  fireEvent.click(label);
  expect(screen.getByRole("dialog")).toBe(dialog);
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "Search models" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Deep" }));
  expect(change).toHaveBeenCalledExactlyOnceWith("provider-model", "deep-id");
  expect(screen.queryByRole("textbox", { name: "Search models" })).toBeNull();
  expect(document.activeElement).toBe(label);
  fireEvent.click(label);
  fireEvent.click(screen.getByRole("button", { name: "Back to reasoning" }));
  expect(document.activeElement).toBe(label);
});

it("preserves agent-provided model names, descriptions, and IDs", async () => {
  const change = vi.fn();
  render(
    <ModelMenu
      provider="codex"
      controls={[
        {
          ...controls[0],
          currentValue: "gpt-6.1-sol",
          options: [
            {
              value: "gpt-6.1-sol",
              name: "6.1 Sol",
              description: "Agent-provided model details",
            },
            { value: "gpt-6-astra", name: "GPT-6 Astra" },
            { value: "custom-model", name: "Custom" },
          ],
        },
      ]}
      onChange={change}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Choose model and reasoning" }),
  );
  const summary = await screen.findByRole("button", { name: "Choose model" });
  expect(summary.textContent).toContain("6.1 Sol");
  expect(summary.textContent).not.toContain("GPT-6.1 Sol");
  fireEvent.click(summary);
  expect(screen.getByText("Agent-provided model details")).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Search models" }), {
    target: { value: "Agent-provided model details" },
  });
  expect(screen.getByRole("button", { name: "6.1 Sol" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Custom" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Search models" }), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "GPT-6 Astra" }));
  expect(change).toHaveBeenCalledExactlyOnceWith(
    "provider-model",
    "gpt-6-astra",
  );
});

it("keeps permissions before launch without duplicating the composer mode picker", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  render(
    <DiscoveryModelMenu
      provider="codex"
      onProviderChange={() => {}}
      state={{
        busy: false,
        preview: false,
        selections: {},
        set: change,
        retry: vi.fn(),
        config: {
          models: null,
          modes: {
            currentModeId: "read-only",
            availableModes: [
              { id: "read-only", name: "Read-only" },
              { id: "workspace-write", name: "Workspace access" },
              { id: "agent", name: "Auto review" },
              { id: "agent-full-access", name: "Full access" },
            ],
          },
          configOptions: JSON.parse(
            JSON.stringify([
              ...controls,
              {
                id: "mode",
                name: "Mode",
                category: "mode",
                type: "select",
                currentValue: "agent",
                options: [
                  { value: "read-only", name: "Read-only" },
                  { value: "workspace-write", name: "Workspace access" },
                  { value: "agent", name: "Auto review" },
                  { value: "agent-full-access", name: "Full access" },
                ],
              },
              {
                id: "collaboration_mode",
                name: "Collaboration mode",
                type: "select",
                currentValue: "default",
                options: [
                  { value: "default", name: "Default" },
                  { value: "plan", name: "Plan" },
                ],
              },
              {
                id: "fast-mode",
                name: "Fast mode",
                type: "boolean",
                currentValue: false,
              },
            ]),
          ),
        },
      }}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Choose model and reasoning" }),
  );
  expect(screen.getAllByRole("combobox")).toHaveLength(1);
  expect(screen.queryByRole("combobox", { name: "Mode" })).toBeNull();
  await user.click(screen.getByRole("combobox", { name: "Permissions" }));
  await user.click(await screen.findByRole("option", { name: "Read-only" }));
  expect(change).toHaveBeenCalledWith("mode", "read-only");
  expect(screen.queryByRole("tab", { name: "Plan" })).toBeNull();
  await waitFor(() =>
    expect(
      screen
        .getByRole("switch", { name: "Fast mode" })
        .getAttribute("aria-checked"),
    ).toBe("false"),
  );
});

it("shows a pending model immediately and accepts a newer selection while syncing", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  render(
    <ModelMenu
      provider="custom"
      controls={controls}
      busy
      pendingSelections={{ "provider-model": "deep-id" }}
      onChange={change}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Choose model and reasoning" }),
  );
  expect(
    screen.getByRole("button", { name: "Choose model" }).textContent,
  ).toContain("Deep");
  await user.click(screen.getByRole("button", { name: "Choose model" }));
  await user.click(screen.getByRole("button", { name: "Fast" }));
  expect(change).toHaveBeenCalledWith("provider-model", "fast-id");
  await user.keyboard("{Escape}");
});
