import { useLayoutEffect, type ReactNode } from "react";
import { cssLengthToPixels } from "../lib/units";
import {
  SIDEBAR_CHROME_PINNED_WIDTH,
  SIDEBAR_HISTORY_RESERVE,
} from "../lib/shell-layout";
import { useSidebar } from "./ui/sidebar";

// The header uses the same width and transition as Fluid's sidebar shell.
// Once collapsed it retains only the space needed for the window controls.
export function ChromeSidebarTrack({ children }: { children?: ReactNode }) {
  const { open, isMobile } = useSidebar();
  // Open: end just before back/forward, so those sit on the sidebar's trailing
  // edge. Collapsed: end at the pinned controls. Written from the card edge so
  // a drag and the slide both move the title on the same frame.
  useLayoutEffect(() => {
    const card = document.querySelector(
      '.harbor-sidebar > div[style*="width"]',
    );
    const track = document.querySelector(".topbar-left") as HTMLElement | null;
    if (!card || !track || isMobile) return;
    const read = () => {
      // The shell's box collapses to zero; the painted card is what slides.
      // Fullscreen drops the traffic-light gap, so the pinned cluster is narrower.
      const shell = track.closest(".app-shell");
      const declared = shell
        ? getComputedStyle(shell).getPropertyValue("--topbar-pinned-width")
        : "";
      const pinned =
        cssLengthToPixels(declared.trim()) || SIDEBAR_CHROME_PINNED_WIDTH;
      const right = Math.max(0, card.getBoundingClientRect().right);
      const next =
        right > pinned
          ? Math.max(pinned, right - SIDEBAR_HISTORY_RESERVE)
          : pinned;
      track.style.width = `${Math.round(next)}px`;
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(card);
    let frame = 0;
    const watch = () => {
      read();
      frame = requestAnimationFrame(watch);
    };
    frame = requestAnimationFrame(watch);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [open, isMobile, SIDEBAR_CHROME_PINNED_WIDTH, SIDEBAR_HISTORY_RESERVE]);
  return <div className="topbar-left">{children}</div>;
}

export function ChromeSidebarDivider({
  visible = true,
}: {
  visible?: boolean;
}) {
  return <span className="topbar-divider" data-visible={visible} />;
}
