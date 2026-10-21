// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectDialog } from "./ProjectDialog";
import type { Workspace } from "../lib/bindings/Workspace";
const mock = vi.hoisted(() => ({
  call: vi.fn(),
  open: vi.fn(),
  saved: vi.fn(),
  close: vi.fn(),
}));
vi.mock("../lib/api", () => ({ desktop: true, call: mock.call }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mock.open }));
const workspaces: Workspace[] = [
  {
    id: "older",
    name: "platform",
    path: "/old/platform",
    lastUsedAt: 1,
    available: true,
    isGitRoot: true,
  },
  {
    id: "recent",
    name: "platform",
    path: "/new/platform",
    lastUsedAt: 2,
    available: true,
    isGitRoot: false,
  },
];
beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({
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
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
beforeEach(() => {
  vi.clearAllMocks();
  mock.saved.mockResolvedValue(undefined);
  mock.call.mockResolvedValue({
    id: "created",
    name: "Launch",
    workspaceId: "recent",
    icon: "rocket",
    color: "purple",
  });
});
afterEach(cleanup);
function mount(project?: {
  id: string;
  name: string;
  workspaceId: string;
  icon: string;
  color: string;
}) {
  return render(
    <ProjectDialog
      project={project}
      workspaces={workspaces}
      onClose={mock.close}
      onSaved={mock.saved}
    />,
  );
}
it("keeps search hover separate from the folder rows", async () => {
  // JSDOM has no layout; give the hover hook a menu with measurable rows.
  const layoutMocks = [
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(300),
    vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute("data-fluid-hover-index") ? 36 : 200;
      }),
    vi
      .spyOn(HTMLElement.prototype, "offsetTop", "get")
      .mockImplementation(function (this: HTMLElement) {
        const index = this.getAttribute("data-fluid-hover-index");
        return index === null ? 0 : 64 + Number(index) * 36;
      }),
    vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(0, 0, 300, 200)),
  ];
  try {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Choose workspace" }));
    const search = screen.getByRole("searchbox", {
      name: "Search local folders",
    });
    const firstRow = screen.getAllByRole("menuitemradio")[0];
    await waitFor(() => expect(document.activeElement).toBe(search));

    fireEvent.mouseMove(firstRow, { clientX: 10, clientY: 80 });
    await waitFor(() =>
      expect(firstRow.hasAttribute("data-fluid-hover-active")).toBe(true),
    );
    fireEvent.mouseMove(search, { clientX: 10, clientY: 5 });
    await waitFor(() =>
      expect(firstRow.hasAttribute("data-fluid-hover-active")).toBe(false),
    );
    expect(document.activeElement).toBe(search);

    fireEvent.mouseMove(search.parentElement!, { clientX: 2, clientY: 5 });
    // Wait past the hook's scheduled frame to catch a highlight reappearing.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    expect(firstRow.hasAttribute("data-fluid-hover-active")).toBe(false);
    fireEvent.mouseMove(firstRow, { clientX: 10, clientY: 80 });
    await waitFor(() =>
      expect(firstRow.hasAttribute("data-fluid-hover-active")).toBe(true),
    );
  } finally {
    layoutMocks.forEach((mock) => mock.mockRestore());
  }
});
it("requires name and folder, searches paths, and saves chosen appearance", async () => {
  const user = userEvent.setup();
  mount();
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "Project name" }),
  );
  expect(
    screen
      .getByRole("button", { name: "Create project" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await user.type(
    screen.getByRole("textbox", { name: "Project name" }),
    "Launch",
  );
  await user.click(screen.getByRole("button", { name: "Choose workspace" }));
  expect(
    screen.getAllByRole("menuitemradio").map((e) => e.textContent),
  ).toEqual([
    expect.stringContaining("/new/platform"),
    expect.stringContaining("/old/platform"),
  ]);
  await user.type(
    screen.getByRole("searchbox", { name: "Search local folders" }),
    "/new/",
  );
  expect(screen.getAllByRole("menuitemradio")).toHaveLength(1);
  await user.click(screen.getByRole("menuitemradio"));
  await user.click(
    screen.getByRole("button", { name: "Choose project icon and color" }),
  );
  await user.click(screen.getByRole("menuitem", { name: /^Icon/ }));
  await user.click(
    await screen.findByRole("menuitemradio", { name: "Rocket" }),
  );
  await user.keyboard("{ArrowLeft}");
  await user.click(await screen.findByRole("menuitem", { name: /^Color/ }));
  await user.click(
    await screen.findByRole("menuitemradio", { name: "Purple" }),
  );
  await user.keyboard("{ArrowLeft}");
  await user.click(await screen.findByRole("menuitem", { name: "Done" }));
  await user.click(
    await screen.findByRole("button", { name: "Create project" }),
  );
  await waitFor(() => expect(mock.close).toHaveBeenCalledOnce());
  expect(mock.call).toHaveBeenCalledWith("save_project", {
    projectId: null,
    name: "Launch",
    icon: "rocket",
    color: "purple",
    workspacePath: "/new/platform",
  });
});
it("retains the selected workspace when the native chooser is cancelled", async () => {
  const user = userEvent.setup();
  mock.open.mockResolvedValue(null);
  mount({
    id: "p",
    name: "Keep",
    icon: "folder",
    color: "gray",
    workspaceId: "recent",
  });
  await user.click(screen.getByRole("button", { name: "Choose workspace" }));
  await user.click(screen.getByRole("menuitem", { name: "Browse folders…" }));
  await waitFor(() =>
    expect(mock.open).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: "Choose a workspace folder",
    }),
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Choose workspace" }),
    ),
  );
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(mock.call).toHaveBeenCalledWith(
    "save_project",
    expect.objectContaining({ projectId: "p", workspacePath: "/new/platform" }),
  );
});
it("retains edits on failure and submits once while saving", async () => {
  const user = userEvent.setup();
  mock.call.mockRejectedValueOnce(new Error("Folder unavailable"));
  mount({
    id: "p",
    name: "Before",
    icon: "heart",
    color: "pink",
    workspaceId: "recent",
  });
  const name = screen.getByRole("textbox", { name: "Project name" });
  fireEvent.change(name, { target: { value: "After" } });
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText("Error: Folder unavailable")).toBeTruthy();
  expect((name as HTMLInputElement).value).toBe("After");
  let resolve!: (value: unknown) => void;
  mock.call.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const submit = screen.getByRole("button", { name: "Save changes" });
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(mock.call).toHaveBeenCalledTimes(2);
  resolve({ id: "p" });
  await waitFor(() => expect(mock.close).toHaveBeenCalledOnce());
});
it("accepts a browsed ordinary folder and saves edits to the existing ID", async () => {
  const user = userEvent.setup();
  mock.open.mockResolvedValue("/local/notes");
  mount({
    id: "p",
    name: "Notes",
    icon: "book-open",
    color: "teal",
    workspaceId: "older",
  });
  await user.click(screen.getByRole("button", { name: "Choose workspace" }));
  await user.click(screen.getByRole("menuitem", { name: "Browse folders…" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Choose workspace" }).textContent,
    ).toContain("notes"),
  );
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(mock.call).toHaveBeenCalledWith("save_project", {
    projectId: "p",
    name: "Notes",
    icon: "book-open",
    color: "teal",
    workspacePath: "/local/notes",
  });
});
