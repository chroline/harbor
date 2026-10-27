// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Worktrees } from "./Worktrees";

const mock = vi.hoisted(() => ({
  call: vi.fn(),
  refresh: vi.fn(),
  setError: vi.fn(),
}));
vi.mock("../lib/api", () => ({ call: mock.call }));
vi.mock("../lib/store", () => ({
  useStore: () => ({
    data: {
      workspaces: [
        {
          id: "repo",
          name: "repository",
          path: "/repo",
          available: true,
          isGitRoot: true,
        },
      ],
      projects: [],
      sessions: [],
      archives: [],
      worktrees: [],
    },
    refresh: mock.refresh,
    setError: mock.setError,
  }),
}));
beforeAll(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("distinguishes pending and failed loads from an empty workspace, and allows retry", async () => {
  let reject!: (error: Error) => void;
  mock.call.mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const user = userEvent.setup();
  render(<Worktrees onSession={vi.fn()} onNew={vi.fn()} />);
  expect(screen.getByRole("status").textContent).toContain("Loading worktrees");
  expect(screen.queryByRole("button", { name: /Start a new task/ })).toBeNull();
  reject(new Error("Folder unavailable"));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Folder unavailable",
  );
  expect(screen.queryByRole("button", { name: /Start a new task/ })).toBeNull();
  mock.call.mockResolvedValue([
    { path: "/repo", branch: "main", is_main: true },
  ]);
  await user.click(
    screen.getByRole("button", { name: "Refresh worktrees and archives" }),
  );
  await screen.findByText("Main checkout");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(mock.setError).not.toHaveBeenCalled();
});

it("keeps previously loaded rows visible when refresh fails", async () => {
  mock.call.mockResolvedValue([
    { path: "/repo", branch: "main", is_main: true },
  ]);
  const user = userEvent.setup();
  render(<Worktrees onSession={vi.fn()} onNew={vi.fn()} />);
  await screen.findByText("Main checkout");
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Refresh worktrees and archives" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  mock.call.mockRejectedValue(new Error("Workspace disconnected"));
  await user.click(
    screen.getByRole("button", { name: "Refresh worktrees and archives" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Previously loaded worktrees",
  );
  expect(screen.getByText("Main checkout")).toBeTruthy();
});
