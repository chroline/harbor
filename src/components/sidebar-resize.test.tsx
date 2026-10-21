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
import { MotionConfig } from "framer-motion";
import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";
import { SidebarKeyboardShortcut } from "./SidebarKeyboardShortcut";
import { ChromeSidebarDivider } from "./ChromeSidebarTrack";
import { TooltipProvider } from "./ui/tooltip";
import { cssLengthToPixels } from "../lib/units";

let mobile = false;
beforeEach(() => {
  mobile = false;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      query.includes("reduced-motion") ||
      (mobile && query.includes("max-width")),
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
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => true);
  Element.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function State() {
  const { open, isResizing, width, openMobile } = useSidebar();
  return (
    <output
      data-testid="state"
      data-open={String(open)}
      data-resizing={String(isResizing)}
      data-width={width}
      data-mobile-open={String(openMobile)}
    />
  );
}
function Harness({ defaultOpen = true, topbar = false }: { defaultOpen?: boolean; topbar?: boolean }) {
  const [width, setWidth] = useState("16rem");
  return (
    <MotionConfig reducedMotion="always">
      <TooltipProvider>
        <SidebarProvider
          defaultOpen={defaultOpen}
          width={width}
          onWidthChange={setWidth}
          persist={false}
          shortcut={null}
          shortcutLabel="⌘ B"
          mobileBreakpoint={600}
        >
          <SidebarKeyboardShortcut />
          <SidebarTrigger />
          {topbar && <ChromeSidebarDivider />}
          <Sidebar rail={!topbar}>
            <button>Navigation item</button>
          </Sidebar>
          <State />
        </SidebarProvider>
      </TooltipProvider>
    </MotionConfig>
  );
}
const state = (key: string) =>
  screen.getByTestId("state").getAttribute(`data-${key}`);
const width = () => cssLengthToPixels(state("width")!);
function rail() {
  const handle = screen.getByRole("button", {
    name: "Resize or collapse sidebar",
  });
  const panel = handle.closest('[data-slot="sidebar"]');
  if (panel) Object.defineProperty(
    panel,
    "offsetWidth",
    { configurable: true, get: width },
  );
  return handle;
}
function down(handle: HTMLElement, x = 256) {
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: x });
}
function move(handle: HTMLElement, x: number) {
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: x });
}
function up(handle: HTMLElement) {
  fireEvent.pointerUp(handle, { pointerId: 1 });
}

describe.each([false, true])("Fluid rail in topbar: %s", (topbar) => {
  it("resizes to Fluid's bounds without treating a drag as a collapse click", () => {
    render(<Harness topbar={topbar} />);
    const handle = rail();
    down(handle);
    move(handle, 318);
    expect(width()).toBe(318);
    expect(state("resizing")).toBe("true");
    move(handle, 155);
    expect(width()).toBe(160);
    move(handle, 800);
    expect(width()).toBe(360);
    up(handle);
    expect(state("open")).toBe("true");
    expect(state("resizing")).toBe("false");
  });
  it("collapses on click, previews drag collapse, and recovers before release", () => {
    render(<Harness topbar={topbar} />);
    let handle = rail();
    down(handle);
    up(handle);
    expect(state("open")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    handle = rail();
    down(handle);
    move(handle, 100);
    expect(state("open")).toBe("false");
    expect(width()).toBe(160);
    move(handle, 280);
    expect(state("open")).toBe("true");
    expect(width()).toBe(280);
    up(handle);
    down(handle, 280);
    move(handle, 100);
    up(handle);
    expect(state("open")).toBe("false");
  });
  it("ends cancelled drags and lost capture without a collapse click", () => {
    render(<Harness topbar={topbar} />);
    const handle = rail();
    down(handle);
    move(handle, 300);
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    move(handle, 330);
    up(handle);
    expect(width()).toBe(300);
    expect(state("open")).toBe("true");
    expect(state("resizing")).toBe("false");
    down(handle, 300);
    move(handle, 320);
    fireEvent.lostPointerCapture(handle, { pointerId: 1 });
    move(handle, 340);
    up(handle);
    expect(width()).toBe(320);
    expect(state("resizing")).toBe("false");
  });
});

it("only offers the topbar rail for an expanded desktop sidebar", () => {
  const { rerender } = render(<Harness topbar defaultOpen={false} />);
  expect(screen.queryByRole("button", { name: "Resize or collapse sidebar" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
  expect(rail()).toBeTruthy();
  mobile = true;
  rerender(<Harness key="mobile" topbar />);
  expect(screen.queryByRole("button", { name: "Resize or collapse sidebar" })).toBeNull();
});

describe("Harbor's Fluid sidebar shortcut", () => {
  it("uses Cmd/Ctrl+B and leaves bare upstream shortcut keys disabled", () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: "[" });
    fireEvent.keyDown(window, { key: "b" });
    expect(state("open")).toBe("true");
    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(state("open")).toBe("false");
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(state("open")).toBe("true");
  });
  it("opens the mobile drawer without changing saved desktop visibility", () => {
    mobile = true;
    render(<Harness defaultOpen={false} />);
    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(state("mobile-open")).toBe("true");
    expect(state("open")).toBe("false");
    expect(screen.getByRole("dialog", { name: "Sidebar" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(state("mobile-open")).toBe("false");
    expect(state("open")).toBe("false");
  });
  it("dismisses the drawer with Escape and restores its opening control's focus", async () => {
    mobile = true;
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Toggle Sidebar" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Sidebar" });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Sidebar" })).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
