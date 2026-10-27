// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import {
  useProviderConfig,
  modelSelections,
  configurationSelections,
  missingModelMessage,
  invalidateProviderConfig,
} from "./provider-config";
import type { ProviderDefinition } from "./bindings/ProviderDefinition";

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("./api", () => ({ desktop: true, call, json: (v: unknown) => v }));
afterEach(() => {
  cleanup();
  call.mockReset();
});

it("rediscovers models after replacing a missing executable for the same provider", async () => {
  call.mockRejectedValueOnce(
    new Error("codex-acp is not installed or executable"),
  );
  const p = {
    ...provider("renamed-codex-acp"),
    command: "codex-acp",
    args: ["acp"],
  };
  const hook = renderHook(({ p }) => useProviderConfig(p), {
    initialProps: { p },
  });
  await waitFor(() =>
    expect(hook.result.current.error).toContain("not installed"),
  );
  call.mockResolvedValueOnce(config("renamed-model"));
  hook.rerender({
    p: { ...p, command: "local-codex-acp", nativeCommand: "local-codex-acp" },
  });
  await waitFor(() =>
    expect(hook.result.current.selections.model).toBe("renamed-model"),
  );
  expect(hook.result.current.error).toBeUndefined();
  expect(call).toHaveBeenCalledTimes(2);
});

it("serializes rapid mode changes and shares the final selection before launch", async () => {
  const modeConfig = (value: string) => ({
    ...config("fast"),
    configOptions: [
      {
        id: "collaboration_mode",
        type: "select",
        name: "Mode",
        currentValue: value,
        options: ["default", "plan"].map((v) => ({ value: v, name: v })),
      },
    ],
  });
  call.mockResolvedValueOnce(modeConfig("default"));
  const p = provider("mode-queue");
  const home = renderHook(() => useProviderConfig(p));
  const launch = renderHook(() => useProviderConfig(p));
  await waitFor(() => expect(home.result.current.config).toBeDefined());
  let finish!: (v: ReturnType<typeof modeConfig>) => void;
  call.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  call.mockResolvedValueOnce(modeConfig("default"));
  act(() => {
    home.result.current.set("collaboration_mode", "plan");
    home.result.current.set("collaboration_mode", "default");
  });
  expect(home.result.current.blocked?.()).toBe(true);
  expect(call).toHaveBeenCalledTimes(2);
  await act(async () => finish(modeConfig("plan")));
  await waitFor(() => expect(home.result.current.busy).toBe(false));
  expect(call).toHaveBeenCalledTimes(3);
  expect(launch.result.current.selections.collaboration_mode).toBe("default");
});

it("keeps a failed prelaunch mode change blocked until retried or canceled", async () => {
  call.mockResolvedValueOnce(config("fast"));
  const hook = renderHook(() => useProviderConfig(provider("mode-error")));
  await waitFor(() => expect(hook.result.current.config).toBeDefined());
  call.mockRejectedValueOnce(new Error("Mode unavailable"));
  act(() => hook.result.current.set("mode", "plan"));
  await waitFor(() =>
    expect(hook.result.current.error).toContain("Mode unavailable"),
  );
  expect(hook.result.current.pending?.mode).toBe("plan");
  expect(hook.result.current.blocked?.()).toBe(true);
  act(() => hook.result.current.cancel?.());
  expect(hook.result.current.blocked?.()).toBe(false);
});

it("carries legacy modes into launch only when no modern mode control exists", () => {
  expect(
    configurationSelections({
      configOptions: [],
      models: null,
      modes: { currentModeId: "ask" },
    }),
  ).toEqual({ __legacy_mode: "ask" });
  expect(
    configurationSelections({
      configOptions: [
        { id: "mode", type: "select", category: "mode", currentValue: "plan" },
      ],
      models: null,
      modes: { currentModeId: "ask" },
    }),
  ).toEqual({ mode: "plan" });
});
const provider = (id: string): ProviderDefinition => ({
  id: "codex",
  name: id,
  command: id,
  args: [],
  nativeCommand: "",
  color: "",
  installHint: "",
});
const config = (model: string) => ({
  configOptions: [
    {
      id: "model",
      category: "model",
      name: "Model",
      type: "select",
      currentValue: model,
      options: [{ value: model, name: model }],
    },
    {
      id: "effort",
      category: "thought_level",
      name: "Effort",
      type: "select",
      currentValue: model === "deep" ? "high" : "low",
      options: [],
    },
  ],
  models: null,
});

it("discovers with no project and shares selections between Home and launch without duplicate connections", async () => {
  call.mockImplementation(async (_command, args) =>
    config(args.selections.model ?? "fast"),
  );
  const p = provider("shared");
  const home = renderHook(() => useProviderConfig(p), { wrapper: StrictMode });
  const launch = renderHook(() => useProviderConfig(p), {
    wrapper: StrictMode,
  });
  await waitFor(() => expect(home.result.current.config).toBeDefined());
  expect(call).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith("discover_provider_config", {
    providerId: "codex",
    selections: {},
  });
  act(() => home.result.current.set("model", "deep"));
  await waitFor(() =>
    expect(launch.result.current.selections).toEqual({
      model: "deep",
      effort: "high",
    }),
  );
});

it("keeps a slow response from one provider out of another provider's controls", async () => {
  let complete!: (value: ReturnType<typeof config>) => void;
  call.mockImplementation((_command, args) =>
    args.providerId === "codex"
      ? new Promise((resolve) => {
          complete = resolve;
        })
      : Promise.resolve(config("other")),
  );
  const hook = renderHook(({ p }) => useProviderConfig(p), {
    initialProps: { p: provider("slow") },
  });
  hook.rerender({ p: { ...provider("quick"), id: "claude" } });
  await waitFor(() =>
    expect(hook.result.current.selections.model).toBe("other"),
  );
  await act(async () => complete(config("late")));
  expect(hook.result.current.selections.model).toBe("other");
});

it("does not transfer operating modes as model preferences and supports legacy models", () => {
  expect(
    modelSelections({
      configOptions: [
        {
          id: "mode",
          category: "mode",
          type: "select",
          currentValue: "dangerous",
        },
      ],
      models: { currentModelId: "native-model" },
    }),
  ).toEqual({ __legacy_model: "native-model" });
});

it("reports the connected version without claiming model selection is impossible", () => {
  expect(
    missingModelMessage({
      configOptions: [],
      models: null,
      agentInfo: { name: "claude-agent-acp", version: "0.97.0" },
    }),
  ).toContain("claude-agent-acp 0.97.0");
  expect(
    missingModelMessage({
      configOptions: [],
      models: null,
      agentInfo: { name: "codex-acp", version: "2.3.0" },
    }),
  ).toContain("provider sign-in");
});
it("preserves opaque model IDs unchanged", () => {
  const id = JSON.stringify(["provider-model", "claude-test"]);
  expect(modelSelections({ ...config(id) }).model).toBe(id);
});

it("preserves permissions, collaboration, and boolean options through model changes and retries", async () => {
  call.mockImplementation(async (_command, args) => ({
    ...config(args.selections.model ?? "fast"),
    configOptions: [
      ...config(args.selections.model ?? "fast").configOptions,
      {
        id: "mode",
        name: "Mode",
        category: "mode",
        type: "select",
        currentValue: args.selections.mode ?? "read-only",
        options: [],
      },
      {
        id: "collaboration_mode",
        name: "Collaboration mode",
        type: "select",
        currentValue: args.selections.collaboration_mode ?? "default",
        options: [],
      },
      {
        id: "fast-mode",
        name: "Fast mode",
        type: "boolean",
        currentValue: false,
      },
    ],
  }));
  const hook = renderHook(() => useProviderConfig(provider("launch-settings")));
  await waitFor(() => expect(hook.result.current.config).toBeDefined());
  act(() => hook.result.current.set("mode", "workspace-write"));
  await waitFor(() =>
    expect(hook.result.current.selections.mode).toBe("workspace-write"),
  );
  act(() => hook.result.current.set("collaboration_mode", "plan"));
  await waitFor(() =>
    expect(hook.result.current.selections.collaboration_mode).toBe("plan"),
  );
  act(() => hook.result.current.set("model", "deep"));
  await waitFor(() =>
    expect(hook.result.current.selections.model).toBe("deep"),
  );
  const selected = {
    model: "deep",
    effort: "high",
    mode: "workspace-write",
    collaboration_mode: "plan",
    "fast-mode": false,
  };
  expect(hook.result.current.selections).toEqual(selected);
  act(() => hook.result.current.retry());
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  expect(call).toHaveBeenLastCalledWith("discover_provider_config", {
    providerId: "codex",
    selections: selected,
  });
});
it("includes a legacy model together with pre-launch operating settings", () => {
  expect(
    configurationSelections({
      configOptions: [
        { id: "mode", type: "select", currentValue: "read-only" },
      ],
      models: { currentModelId: "legacy-model" },
    }),
  ).toEqual({ __legacy_model: "legacy-model", mode: "read-only" });
});

it("ignores invalidated responses even when the same executable is selected again", async () => {
  let finish!: (value: ReturnType<typeof config>) => void;
  call.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const p = provider("invalidated-executable");
  const hook = renderHook(() => useProviderConfig(p));
  await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
  call.mockResolvedValueOnce(config("current"));
  act(() => invalidateProviderConfig(p.id));
  await waitFor(() => expect(hook.result.current.selections.model).toBe("current"));
  await act(async () => finish(config("stale")));
  expect(hook.result.current.selections.model).toBe("current");
});
