// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspacePicker } from "./WorkspacePicker";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
const workspaces = [
  {
    id: "older",
    name: "Platform",
    path: "/work/platform",
    lastUsedAt: 1,
    available: true,
    isGitRoot: true,
  },
  {
    id: "recent",
    name: "Notes",
    path: "/personal/notes",
    lastUsedAt: 2,
    available: true,
    isGitRoot: false,
  },
];
function mount(value = "older") {
  const change = vi.fn(),
    add = vi.fn();
  render(
    <WorkspacePicker
      workspaces={workspaces}
      value={value}
      onValueChange={change}
      onAddWorkspace={add}
    />,
  );
  return { change, add };
}
it("opens an internal search field and lists recent folders with the selection checked", async () => {
  const user = userEvent.setup();
  const { change } = mount();
  const trigger = screen.getByRole("button", {
    name: "Workspace for new task",
  });
  expect(trigger.textContent).toContain("Platform");
  expect(screen.queryByRole("searchbox")).toBeNull();
  await user.click(trigger);
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("searchbox", { name: "Search workspaces" }),
    ),
  );
  expect(screen.getByText("Recents")).toBeTruthy();
  expect(
    screen
      .getAllByRole("menuitemradio")
      .map((row) => row.getAttribute("title")),
  ).toEqual(["/personal/notes", "/work/platform", null]);
  expect(
    screen
      .getByRole("menuitemradio", { name: "Platform" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  await user.click(screen.getByRole("menuitemradio", { name: "Notes" }));
  expect(change).toHaveBeenCalledWith("recent");
});
it("searches names and paths while keeping folder actions available", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(
    screen.getByRole("button", { name: "Workspace for new task" }),
  );
  const search = screen.getByRole("searchbox", { name: "Search workspaces" });
  await user.type(search, "/personal/");
  expect(screen.getByRole("menuitemradio", { name: "Notes" })).toBeTruthy();
  expect(screen.queryByRole("menuitemradio", { name: "Platform" })).toBeNull();
  await user.clear(search);
  await user.type(search, "missing");
  expect(screen.getByText("No matching workspaces")).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "Use Existing…" })).toBeTruthy();
});
it("keeps freeform chat and the native folder chooser as separate actions", async () => {
  const user = userEvent.setup();
  const { change, add } = mount("");
  await user.click(
    screen.getByRole("button", { name: "Workspace for new task" }),
  );
  expect(
    screen
      .getByRole("menuitemradio", { name: "No workspace" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  await user.click(screen.getByRole("menuitem", { name: "Use Existing…" }));
  expect(add).toHaveBeenCalledOnce();
  expect(change).not.toHaveBeenCalled();
});
