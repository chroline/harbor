"use client";
import { pixelsToRem } from "@/lib/units";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

type ShapeVariant = "pill" | "rounded";

interface ShapeClasses {
  /** The variant these classes belong to — handy for conditionals. */
  variant: ShapeVariant;
  item: string;
  bg: string;
  focusRing: string;
  mergedBg: string;
  container: string;
  button: string;
  input: string;
  // Numeric counterparts of `bg` / `mergedBg`, in px. Needed where individual
  // corners are animated (e.g. the selected-background merge/split animation),
  // which requires per-corner numeric border-radii rather than a class.
  bgRadius: number;
  /** Numeric counterpart of `container`. Popup shells use a 0.25rem inset, so
   *  containerRadius = bgRadius + 4 keeps their curves concentric. */
  containerRadius: number;
  mergedRadius: number;
}

/**
 * Radius for a surface inset inside another rounded surface.
 *
 * `inset` is the interior spacing (usually parent padding); pass the parent's
 * border separately as `borderWidth`. Together they form the visible
 * edge-to-edge distance. Clamping at zero prevents an invalid negative radius.
 */
function nestedRadius(
  outerRadius: number,
  inset: number,
  borderWidth = 0
) {
  return Math.max(0, outerRadius - inset - borderWidth);
}

const shapeMap: Record<ShapeVariant, ShapeClasses> = {
  pill: {
    variant: "pill",
    item: "rounded-[1.25rem]",
    bg: "rounded-[1.25rem]",
    // +0.125rem over `item` because the focus ring sits 0.125rem outside the element
    // (top/left -2, width/height +4); this keeps the corners concentric so a
    // pill element gets a pill ring (matches the rounded-mode 0.5rem→0.625rem bump).
    focusRing: "rounded-[1.375rem]",
    mergedBg: "rounded-2xl",
    container: "rounded-3xl",
    button: "rounded-[1.25rem]",
    input: "rounded-[1.25rem]",
    bgRadius: 20,
    containerRadius: 24,
    mergedRadius: 16,
  },
  rounded: {
    variant: "rounded",
    item: "rounded-lg",
    bg: "rounded-lg",
    focusRing: "rounded-[0.625rem]",
    mergedBg: "rounded-lg",
    container: "rounded-xl",
    button: "rounded-lg",
    input: "rounded-lg",
    bgRadius: 8,
    containerRadius: 12,
    mergedRadius: 8,
  },
};

interface ShapeContextValue {
  shape: ShapeVariant;
  setShape: (shape: ShapeVariant) => void;
  classes: ShapeClasses;
}

const ShapeContext = createContext<ShapeContextValue | null>(null);

// Rounded is the default on every path: the site demos render under
// <ShapeProvider defaultShape="rounded">, the shipped :focus-visible fallback
// ring assumes its 0.5rem radius, and the preset generators only emit a provider
// for pill. A consumer with no provider gets the corners the docs show.
function useShape(): ShapeClasses {
  const ctx = useContext(ShapeContext);
  if (!ctx) return shapeMap.rounded;
  return ctx.classes;
}

function useShapeContext() {
  const ctx = useContext(ShapeContext);
  if (!ctx) throw new Error("useShapeContext must be used within a ShapeProvider");
  return ctx;
}

function ShapeProvider({
  children,
  defaultShape = "rounded",
}: {
  children: ReactNode;
  defaultShape?: ShapeVariant;
}) {
  const [shape, setShapeState] = useState<ShapeVariant>(defaultShape);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Run a state change under the `.transitioning` guard (added + reflow-flushed
  // first so the 180ms border-radius cross-fade applies). Clearing the previous
  // timeout first keeps a double-press from removing the class mid-fade.
  const transitionShape = useCallback((callback: () => void) => {
    const root = document.documentElement;
    root.classList.add("transitioning");
    void root.offsetHeight;
    callback();
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
    transitionTimeoutRef.current = setTimeout(
      () => root.classList.remove("transitioning"),
      200
    );
  }, []);

  const setShape = useCallback(
    (next: ShapeVariant) => {
      transitionShape(() => setShapeState(next));
    },
    [transitionShape]
  );

  // Publish the current element radius as a CSS custom property so plain-CSS
  // consumers that can't read React context stay in sync with the shape
  // system — e.g. the @layer base :focus-visible fallback ring in
  // globals.css. Set on <html> so portalled content sees it too.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--shape-input-radius",
      `${pixelsToRem(shapeMap[shape].bgRadius)}`
    );
  }, [shape]);

  const value = useMemo(
    () => ({ shape, setShape, classes: shapeMap[shape] }),
    [shape, setShape]
  );

  return (
    <ShapeContext.Provider value={value}>
      {children}
    </ShapeContext.Provider>
  );
}

export { ShapeProvider, useShape, useShapeContext, shapeMap, nestedRadius };
export type { ShapeVariant, ShapeClasses };
