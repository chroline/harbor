import { forwardRef, type ComponentProps, type HTMLAttributes } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useDirection } from "@base-ui/react/direction-provider";
import { X } from "@/lib/icons";
import { cn } from "@/lib/utils";
import "./sheet.css";

// Runtime contract recovered from Kobra's public Sheet demo; see docs/plan-sheet.md.
// Base UI owns modal focus, dismissal, scroll locking, and transition unmounting.
export const Sheet = Dialog.Root;
export const SheetTrigger = forwardRef<
  HTMLButtonElement,
  ComponentProps<typeof Dialog.Trigger>
>((props, ref) => (
  <Dialog.Trigger ref={ref} data-slot="sheet-trigger" {...props} />
));
export const SheetClose = forwardRef<
  HTMLButtonElement,
  ComponentProps<typeof Dialog.Close>
>((props, ref) => (
  <Dialog.Close ref={ref} data-slot="sheet-close" {...props} />
));
export type SheetSide = "start" | "end" | "left" | "right" | "top" | "bottom";
export function sheetSide(side: SheetSide, direction: "ltr" | "rtl") {
  return side === "start"
    ? direction === "rtl"
      ? "right"
      : "left"
    : side === "end"
      ? direction === "rtl"
        ? "left"
        : "right"
      : side;
}
export const SheetContent = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof Dialog.Popup> & {
    side?: SheetSide;
    showCloseButton?: boolean;
  }
>(function SheetContent(
  { side = "end", showCloseButton = true, className, children, ...props },
  ref,
) {
  const direction = useDirection();
  return (
    <Dialog.Portal data-slot="sheet-portal">
      <Dialog.Backdrop
        data-slot="sheet-overlay"
        className="harbor-sheet-overlay"
      />
      <Dialog.Popup
        ref={ref}
        data-slot="sheet-content"
        data-side={sheetSide(side, direction)}
        className={cn("harbor-sheet-content", className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetClose className="harbor-sheet-close" aria-label="Close">
            <X aria-hidden="true" />
          </SheetClose>
        )}
      </Dialog.Popup>
    </Dialog.Portal>
  );
});
export function SheetHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("harbor-sheet-header", className)}
      {...props}
    />
  );
}
export function SheetFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("harbor-sheet-footer", className)}
      {...props}
    />
  );
}
export const SheetTitle = forwardRef<
  HTMLHeadingElement,
  ComponentProps<typeof Dialog.Title>
>(({ className, ...props }, ref) => (
  <Dialog.Title
    ref={ref}
    data-slot="sheet-title"
    className={cn("harbor-sheet-title", className)}
    {...props}
  />
));
export const SheetDescription = forwardRef<
  HTMLParagraphElement,
  ComponentProps<typeof Dialog.Description>
>(({ className, ...props }, ref) => (
  <Dialog.Description
    ref={ref}
    data-slot="sheet-description"
    className={cn("harbor-sheet-description", className)}
    {...props}
  />
));
