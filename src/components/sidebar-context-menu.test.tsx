// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionConfig } from "framer-motion";
import { SidebarRowMenu } from "./SidebarRowMenu";
import {
  SidebarProvider,
  Sidebar,
  SidebarTrigger,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "./ui/sidebar";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Plus, Archive, SquarePen } from "../lib/icons";

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes("reduced-motion"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Harness({
  select = vi.fn(),
  edit = vi.fn(),
  nested = false,
  empty = false,
} = {}) {
  const [dialog, setDialog] = useState(false);
  const row = (
    <SidebarRowMenu
      label="Example"
      actions={
        empty
          ? []
          : [
              { label: "New task", icon: Plus, onSelect: select },
              {
                label: "Edit project…",
                icon: SquarePen,

                onSelect: () => {
                  edit();
                  setDialog(true);
                },
              },
              {
                label: "Archive conversation…",
                icon: Archive,
                destructive: true,

                onSelect: () => setDialog(true),
              },
            ]
      }
    >
      {nested ? (
        <SidebarMenuSubButton asChild>
          <button onClick={select}>Example</button>
        </SidebarMenuSubButton>
      ) : (
        <SidebarMenuButton onClick={select}>Example</SidebarMenuButton>
      )}
    </SidebarRowMenu>
  );
  return (
    <MotionConfig reducedMotion="always">
      <SidebarProvider persist={false} shortcut={null}>
        <SidebarMenu>
          <SidebarMenuItem>
            {nested ? (
              <>
                <SidebarMenuButton>Parent</SidebarMenuButton>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>{row}</SidebarMenuSubItem>
                </SidebarMenuSub>
              </>
            ) : (
              row
            )}
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton>Another row</SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogContent>
            <DialogTitle>Edit example</DialogTitle>
            <input aria-label="Project name" />
          </DialogContent>
        </Dialog>
      </SidebarProvider>
    </MotionConfig>
  );
}
const open = async () => {
  fireEvent.contextMenu(screen.getByRole("button", { name: "Example" }), {
    clientX: 100,
    clientY: 100,
  });
  return screen.findByRole("menu", { name: "Actions for Example" });
};
describe("Sidebar row context menus", () => {
  it("keeps one row button, preserves left-click, and opens right-click actions without selecting", async () => {
    const select = vi.fn();
    render(<Harness select={select} />);
    const row = screen.getByRole("button", { name: "Example" });
    fireEvent.click(row);
    expect(select).toHaveBeenCalledTimes(1);
    select.mockClear();
    await open();
    expect(select).not.toHaveBeenCalled();
    expect(document.querySelector('[data-sidebar="menu-action"]')).toBeNull();
    expect(row.querySelector("button")).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "New task" }));
    await waitFor(() => expect(select).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
  it("opens from Shift+F10, keeps arrow keys in the menu, and restores row focus on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const row = screen.getByRole("button", { name: "Example" });
    row.focus();
    fireEvent.keyDown(row, { key: "F10", shiftKey: true });
    await screen.findByRole("menu");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(row));
  });
  it("opens a dialog for the nested row without returning focus behind it", async () => {
    const edit = vi.fn();
    render(<Harness nested edit={edit} />);
    await open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit project…" }));
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    await screen.findByRole("dialog", { name: "Edit example" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(
        true,
      ),
    );
  });
  it("returns to the originating row after closing a menu-opened dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const row = screen.getByRole("button", { name: "Example" });
    row.focus();
    await open();
    const edit = screen.getByRole("menuitem", { name: "Edit project…" });
    edit.focus();
    fireEvent.click(edit);
    await screen.findByRole("dialog", { name: "Edit example" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(row));
  });
  it("styles the archive action as destructive and leaves rows without actions alone", async () => {
    const { unmount } = render(<Harness />);
    await open();
    expect(
      screen
        .getByRole("menuitem", { name: "Archive conversation…" })
        .getAttribute("data-variant"),
    ).toBe("destructive");
    unmount();
    render(<Harness empty />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Example" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("keeps menus inside a surrounding modal drawer's pointer and focus scope", async () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Sidebar drawer</DialogTitle>
          <Harness />
        </DialogContent>
      </Dialog>,
    );
    await open();
    const menu = screen.getByRole("menu", { name: "Actions for Example" });
    expect(
      screen.getByRole("dialog", { name: "Sidebar drawer" }).contains(menu),
    ).toBe(true);
    const user = userEvent.setup();
    await user.keyboard("{ArrowDown}");
    expect(menu.contains(document.activeElement)).toBe(true);
  });
  it("dismisses the context menu before the mobile sidebar on Escape", async () => {
    window.matchMedia = vi
      .fn()
      .mockImplementation((query) => ({
        matches: true,
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
      }));
    render(
      <SidebarProvider persist={false} shortcut={null}>
        <SidebarTrigger />
        <Sidebar>
          <Harness />
        </Sidebar>
      </SidebarProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    await screen.findByRole("dialog", { name: "Sidebar" });
    await open();
    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(
      screen
        .getByRole("dialog", { name: "Sidebar" })
        .getAttribute("data-state"),
    ).toBe("open");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Sidebar" })).toBeNull(),
    );
  });
});
