// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useTerminalTabs } from "./use-terminal-tabs";

const call = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ call }));
afterEach(() => {
  cleanup();
  call.mockReset();
});
const tab = { id: "shell:chat:one", title: "harbor — zsh", alive: true };

it("restores running terminals and closes only the requested shell", async () => {
  call.mockImplementation((command) =>
    Promise.resolve(
      command === "list_shell_terminals"
        ? [tab]
        : command === "create_shell_terminal"
          ? { ...tab, id: "shell:chat:two" }
          : undefined,
    ),
  );
  const error = vi.fn();
  const { result } = renderHook(() => useTerminalTabs("chat", error));
  await waitFor(() => expect(result.current.tabs).toEqual([tab]));
  await act(async () => {
    await result.current.create();
  });
  expect(result.current.tabs).toHaveLength(2);
  expect(result.current.active).toBe("shell:chat:two");
  act(() => result.current.update(tab.id, { title: "src — vim", alive: true }));
  expect(result.current.tabs[0].title).toBe("src — vim");
  await act(async () => {
    await result.current.close("shell:chat:two");
  });
  expect(result.current.active).toBeNull();
  expect(result.current.tabs.map((t) => t.id)).toEqual([tab.id]);
  expect(call).toHaveBeenCalledWith("close_shell_terminal", {
    terminalId: "shell:chat:two",
  });
  expect(error).not.toHaveBeenCalled();
});

it("keeps a terminal available if closing fails and reports the failure", async () => {
  call.mockImplementation((command) =>
    command === "close_shell_terminal"
      ? Promise.reject(new Error("Could not close"))
      : Promise.resolve([tab]),
  );
  const error = vi.fn();
  const { result } = renderHook(() => useTerminalTabs("chat", error));
  await waitFor(() => expect(result.current.tabs).toHaveLength(1));
  act(() => result.current.setActive(tab.id));
  await act(async () => {
    await result.current.close(tab.id);
  });
  expect(result.current.active).toBe(tab.id);
  expect(result.current.tabs).toEqual([tab]);
  expect(error).toHaveBeenCalledWith("Error: Could not close");
});

it("does not duplicate rapid creations or resurrect a closed tab from a delayed list", async () => {
  let list!: (value: (typeof tab)[]) => void;
  let create!: (value: typeof tab) => void;
  call.mockImplementation((command) =>
    command === "list_shell_terminals"
      ? new Promise((resolve) => {
          list = resolve;
        })
      : command === "create_shell_terminal"
        ? new Promise((resolve) => {
            create = resolve;
          })
        : Promise.resolve(),
  );
  const { result } = renderHook(() => useTerminalTabs("chat", vi.fn()));
  let first!: Promise<void>;
  act(() => {
    first = result.current.create();
    void result.current.create();
  });
  expect(
    call.mock.calls.filter(([command]) => command === "create_shell_terminal"),
  ).toHaveLength(1);
  await act(async () => {
    create(tab);
    await first;
  });
  await act(async () => {
    await result.current.close(tab.id);
  });
  await act(async () => {
    list([tab]);
  });
  expect(result.current.tabs).toEqual([]);
});
