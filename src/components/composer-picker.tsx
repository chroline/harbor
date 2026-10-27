import type { ComponentProps } from "react";
import { Elevated } from "@/lib/elevated";
import { SizeProvider } from "@/lib/size-context";
import { SurfaceProvider } from "@/lib/surface-context";
import { cn } from "@/lib/utils";
import { DropdownContent } from "./ui/dropdown";
import { useComposerTheme } from "@/lib/composer-theme";

/** Composer menus share a surface even when their trigger sits above the input. */
export function ComposerPickerContent({
  className,
  ...props
}: ComponentProps<typeof DropdownContent>) {
  const theme = useComposerTheme();
  return (
    <SurfaceProvider value={2}>
      <SizeProvider size="compact">
        <DropdownContent
          side="top"
          align="start"
          sideOffset={6}
          {...props}
          className={cn("composer-picker-menu", theme, className)}
        />
      </SizeProvider>
    </SurfaceProvider>
  );
}

/** The same shell for pickers that contain navigable panes or editable fields. */
export function ComposerPickerSurface({
  className,
  ...props
}: Omit<ComponentProps<typeof Elevated>, "offset" | "shadowLevel">) {
  const theme = useComposerTheme();
  return (
    <SurfaceProvider value={2}>
      <SizeProvider size="compact">
        <Elevated
          offset={2}
          shadowLevel={3}
          {...props}
          className={cn(
            "composer-picker-menu rounded-xl outline-none",
            theme,
            className,
          )}
        />
      </SizeProvider>
    </SurfaceProvider>
  );
}
