// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorktreePicker } from "./WorktreePicker";

const api = vi.hoisted(() => ({ call: vi.fn().mockResolvedValue(["main", "develop", "origin/main"]) }));
vi.mock("../lib/api", () => ({ call: api.call }));
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
function Harness({ disabled = false }: { disabled?: boolean }) {
  const [tree, setTree] = useState(true);
  const [branch, setBranch] = useState("");
  const [base, setBase] = useState("HEAD");
  return (
    <WorktreePicker
      workspaceId="repo"
      tree={tree}
      onTreeChange={setTree}
      branch={branch}
      onBranchChange={setBranch}
      base={base}
      onBaseChange={setBase}
      disabled={disabled}
    />
  );
}
it("edits branch and base inside the working-directory popup and retains values", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.queryByRole("textbox", { name: "Branch name" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Working directory" }));
  expect(
    screen.getByRole("dialog", { name: "Working directory settings" }),
  ).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
  await user.click(screen.getByRole("menuitemradio", { name: "New worktree" }));
  expect(
    screen.queryByRole("menu", { name: "Working directory choice" }),
  ).toBeNull();
  await user.type(
    screen.getByRole("textbox", { name: "Branch name" }),
    "harbor/fix",
  );
  await user.click(screen.getByRole("button", { name: "Base branch or commit" }));
  await user.type(screen.getByRole("searchbox", { name: "Search base branches" }), "main");
  await screen.findByRole("menuitemradio", { name: "main" });
  expect(screen.getByRole("menuitemradio", { name: "origin/main" })).toBeTruthy();
  await user.keyboard("{ArrowDown}{Enter}");
  expect(screen.getByRole("dialog", { name: "Working directory settings" })).toBeTruthy();
  expect(api.call).toHaveBeenCalledWith("list_branches", { workspaceId: "repo" });
  await user.click(screen.getByRole("textbox", { name: "Branch name" }));
  expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  expect(screen.queryByRole("radio")).toBeNull();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await user.click(screen.getByRole("button", { name: "Working directory" }));
  await user.click(screen.getByRole("menuitemradio", { name: "New worktree" }));
  expect(
    (screen.getByRole("textbox", { name: "Branch name" }) as HTMLInputElement)
      .value,
  ).toBe("harbor/fix");
  expect(screen.getByRole("button", { name: "Base branch or commit" }).textContent).toContain("main");
});
it("switches between current checkout and a new worktree in the same popup", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Working directory" }));
  await user.click(
    screen.getByRole("menuitemradio", { name: "Current checkout" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    screen.getByRole("button", { name: "Working directory" }).textContent,
  ).toContain("Current checkout");
  await user.click(screen.getByRole("button", { name: "Working directory" }));
  expect(screen.queryByRole("textbox")).toBeNull();
  await user.click(screen.getByRole("menuitemradio", { name: "New worktree" }));
  expect(screen.getByRole("textbox", { name: "Branch name" })).toBeTruthy();
  await user.type(
    screen.getByRole("textbox", { name: "Branch name" }),
    "kept-branch",
  );
  await user.click(
    screen.getByRole("button", { name: "Back to working directory choices" }),
  );
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(
    screen
      .getByRole("menuitemradio", { name: "New worktree" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  await user.keyboard("{Enter}");
  expect(
    (screen.getByRole("textbox", { name: "Branch name" }) as HTMLInputElement)
      .value,
  ).toBe("kept-branch");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByRole("dialog")).toBeTruthy();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("disables working-directory changes while starting a task", async () => {
  const user = userEvent.setup();
  render(<Harness disabled />);
  await user.click(screen.getByRole("button", { name: "Working directory" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("selects a custom base commit without closing the worktree settings pane", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Working directory" }));
  await user.click(screen.getByRole("menuitemradio", { name: "New worktree" }));
  await user.click(screen.getByRole("button", { name: "Base branch or commit" }));
  await user.type(screen.getByRole("searchbox", { name: "Search base branches" }), "abc1234");
  await user.click(screen.getByRole("menuitem", { name: "Use “abc1234”" }));
  expect(screen.getByRole("button", { name: "Base branch or commit" }).textContent).toContain("abc1234");
  expect(screen.getByRole("textbox", { name: "Branch name" })).toBeTruthy();
});

it("Escape dismisses the base search before leaving worktree settings", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Working directory" }));
  await user.click(screen.getByRole("menuitemradio", { name: "New worktree" }));
  await user.click(screen.getByRole("button", { name: "Base branch or commit" }));
  await screen.findByRole("searchbox", { name: "Search base branches" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(document.querySelector(".base-branch-menu")).toBeNull());
  expect(screen.getByRole("textbox", { name: "Branch name" })).toBeTruthy();
});
