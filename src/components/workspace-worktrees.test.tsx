// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { Worktrees } from "./Worktrees";
import { browserBootstrap } from "../lib/api";
const mock = vi.hoisted(() => ({
  call: vi.fn().mockResolvedValue([]),
  refresh: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  call: mock.call,
}));
vi.mock("../lib/store", () => ({
  useStore: () => ({
    data: {
      ...browserBootstrap,
      projects: [
        {
          id: "one",
          name: "One",
          workspaceId: "repo",
          icon: "folder",
          color: "gray",
        },
        {
          id: "two",
          name: "Two",
          workspaceId: "repo",
          icon: "code",
          color: "blue",
        },
      ],
      workspaces: [
        {
          id: "repo",
          name: "repo",
          path: "/repo",
          lastUsedAt: 0,
          available: true,
          isGitRoot: true,
        },
        {
          id: "notes",
          name: "notes",
          path: "/notes",
          lastUsedAt: 0,
          available: true,
          isGitRoot: false,
        },
        {
          id: "missing",
          name: "missing",
          path: "/missing",
          lastUsedAt: 0,
          available: false,
          isGitRoot: true,
        },
      ],
    },
    refresh: mock.refresh,
    setError: vi.fn(),
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
});
afterEach(cleanup);
it("fetches shared repositories once and skips ordinary or unavailable folders", async () => {
  render(<Worktrees onSession={() => {}} onNew={() => {}} />);
  await waitFor(() => expect(mock.refresh).toHaveBeenCalled());
  expect(mock.call).toHaveBeenCalledExactlyOnceWith("list_worktrees", {
    workspaceId: "repo",
  });
});
