import {
  useRef,
  useState,
  type ReactElement,
  type HTMLAttributes,
} from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ui/context-menu";
import type { IconComponent } from "../lib/icon-context";

export type SidebarRowAction = {
  label: string;
  icon: IconComponent;
  onSelect: () => void;
  destructive?: boolean;
};

/** Compose the menu onto the existing Fluid row, retaining one focus target. */
export function SidebarRowMenu({
  label,
  children,
  actions,
  reorder,
}: {
  label: string;
  children: ReactElement;
  actions: SidebarRowAction[];
  reorder?: { props: HTMLAttributes<HTMLElement>; actions: SidebarRowAction[] };
}) {
  const rowRef = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(true);
  const pendingAction = useRef<(() => void) | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const rowActions = [...actions, ...(reorder?.actions ?? [])];
  if (!rowActions.length) return children;
  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) {
          setPortalContainer(
            rowRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null,
          );
          restoreFocus.current = true;
          pendingAction.current = null;
        }
      }}
      onOpenChangeComplete={(open) => {
        if (open || !pendingAction.current) return;
        const action = pendingAction.current;
        pendingAction.current = null;
        // Release the menu's focus trap before navigating or opening a dialog.
        // The dialog then remembers the row, rather than a disappearing item.
        rowRef.current?.focus({ preventScroll: true });
        action();
      }}
    >
      <ContextMenuTrigger
        {...reorder?.props}
        ref={(node) => {
          rowRef.current = node;
        }}
        render={children}
        onKeyDown={(event) => {
          if (
            event.key !== "ContextMenu" &&
            !(event.shiftKey && event.key === "F10")
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          const row = event.currentTarget;
          const rect = row.getBoundingClientRect();
          row.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
              clientX: rect.left,
              clientY: rect.bottom,
            }),
          );
        }}
      />
      <ContextMenuContent
        container={portalContainer ?? undefined}
        aria-label={`Actions for ${label}`}
        finalFocus={() =>
          restoreFocus.current && rowRef.current?.isConnected
            ? rowRef.current
            : false
        }
      >
        {rowActions.map(
          ({ label: actionLabel, icon: Icon, onSelect, destructive }) => (
            <ContextMenuItem
              key={actionLabel}
              variant={destructive ? "destructive" : "default"}
              onClick={() => {
                restoreFocus.current = false;
                pendingAction.current = onSelect;
              }}
            >
              <Icon />
              {actionLabel}
            </ContextMenuItem>
          ),
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
