import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SidebarRail, useSidebar } from "./ui/sidebar";
import { spring } from "../lib/springs";

// The header uses the same width and transition as Fluid's sidebar shell.
// Once collapsed it retains only the space needed for the window controls.
export function ChromeSidebarTrack({ children }: { children: ReactNode }) {
  const { width, open, isMobile, isResizing } = useSidebar();
  const trackWidth = open && !isMobile ? width : "10rem";
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="topbar-left"
      initial={false}
      animate={{ width: trackWidth }}
      transition={
        reduced || isResizing
          ? { duration: 0 }
          : open
            ? spring.slow
            : spring.slow.exit
      }
    >
      {children}
    </motion.div>
  );
}

export function ChromeSidebarDivider({
  visible = true,
}: {
  visible?: boolean;
}) {
  const { open, isMobile, isResizing } = useSidebar();
  return (
    <span className="topbar-divider" data-visible={visible}>
      {/* Keep pointer capture alive during a drag-collapse preview so the
          same gesture can pull the sidebar open again. */}
      {!isMobile && (open || isResizing) && (
        <SidebarRail className="topbar-sidebar-rail" />
      )}
    </span>
  );
}
