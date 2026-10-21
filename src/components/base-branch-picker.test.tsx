// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BaseBranchPicker } from "./BaseBranchPicker";

const api = vi.hoisted(() => ({ call: vi.fn() }));
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

async function openPicker() {
  api.call.mockResolvedValue(
    Array.from(
      { length: 2_000 },
      (_, i) => `branch-${String(i).padStart(4, "0")}`,
    ),
  );
  const onValueChange = vi.fn();
  render(
    <BaseBranchPicker
      workspaceId="repo"
      value="HEAD"
      onValueChange={onValueChange}
    />,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Base branch or commit" }),
  );
  await screen.findByRole("menuitemradio", { name: "branch-0000" });
  return { user, onValueChange };
}

it("mounts a bounded window and replaces rows when scrolling through thousands of branches", async () => {
  const { user, onValueChange } = await openPicker();
  expect(screen.getAllByRole("menuitemradio").length).toBeLessThan(30);
  expect(
    screen.queryByRole("menuitemradio", { name: "branch-1999" }),
  ).toBeNull();
  const list = document.querySelector('[data-slot="base-branch-list"]')!;
  const viewport = list.closest<HTMLElement>(
    '[data-slot="scroll-area-viewport"]',
  )!;
  Object.defineProperty(viewport, "clientHeight", { value: 280 });
  fireEvent.scroll(viewport, { target: { scrollTop: 1_991 * 28 } });
  expect(
    screen.getByRole("menuitemradio", { name: "branch-1999" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("menuitemradio", { name: "branch-0000" }),
  ).toBeNull();
  expect(screen.getAllByRole("menuitemradio").length).toBeLessThan(30);
  await user.click(screen.getByRole("menuitemradio", { name: "branch-1999" }));
  expect(onValueChange).toHaveBeenCalledWith("branch-1999");
});

it("navigates past window boundaries and reaches both ends of the full list", async () => {
  const { user, onValueChange } = await openPicker();
  const search = screen.getByRole("searchbox", {
    name: "Search base branches",
  });
  await user.click(search);
  await user.keyboard("{ArrowDown>40/}");
  expect(document.activeElement?.textContent).toContain("branch-0038");
  expect(screen.getAllByRole("menuitemradio").length).toBeLessThan(30);
  await user.keyboard("{End}");
  expect(document.activeElement?.textContent).toContain("branch-1999");
  await user.keyboard("{ArrowDown}");
  expect(document.activeElement).toBe(search);
  await user.keyboard("{ArrowUp}");
  expect(document.activeElement?.textContent).toContain("branch-1999");
  await user.keyboard("{Home}");
  expect(document.activeElement?.textContent).toContain("HEAD");
  await user.keyboard("{End}{Enter}");
  expect(onValueChange).toHaveBeenCalledWith("branch-1999");
});

it("resets the window for search and includes the custom base after all matching branches", async () => {
  const { user, onValueChange } = await openPicker();
  const search = screen.getByRole("searchbox", {
    name: "Search base branches",
  });
  await user.click(search);
  await user.keyboard("{ArrowUp}");
  await user.type(search, "branch");
  await waitFor(() =>
    expect(
      screen.getByRole("menuitemradio", { name: "branch-0000" }),
    ).toBeTruthy(),
  );
  expect(
    screen.queryByRole("menuitemradio", { name: "branch-1999" }),
  ).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "Use “branch”" })).toBeNull();
  await user.keyboard("{ArrowUp}");
  expect(document.activeElement?.textContent).toContain("Use “branch”");
  expect(screen.getAllByRole("menuitemradio").length).toBeLessThan(30);
  await user.keyboard("{Enter}");
  expect(onValueChange).toHaveBeenCalledWith("branch");
});
