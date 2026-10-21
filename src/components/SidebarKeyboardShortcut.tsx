import { useEffect } from "react";
import { useSidebar } from "./ui/sidebar";

/** Harbor owns Cmd/Ctrl+B; Fluid chooses desktop collapse or mobile drawer. */
export function SidebarKeyboardShortcut() {
  const { toggleSidebar } = useSidebar();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.repeat ||
        event.key.toLowerCase() !== "b"
      )
        return;
      event.preventDefault();
      toggleSidebar();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);
  return null;
}
