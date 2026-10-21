"use client";

import { forwardRef, useState, useEffect, type HTMLAttributes } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { rem } from "@/lib/units";
import { LoaderCircle } from "@/lib/icons";
import { fontWeights } from "@/lib/font-weight";
import { useSize, typeClass, type SizeVariant } from "@/lib/size-context";

// The label moves to the next word every 4000ms.
const defaultWords = ["Thinking", "Moonwalking", "Planning", "Refining"];

/** Library-backed activity glyph for use inside an existing status label. */
export function ThinkingIndicatorGlyph({ size }: { size?: SizeVariant }) {
  const compact = useSize(size).variant === "compact";
  return (
    <LoaderCircle
      data-slot="thinking-indicator-glyph"
      size={rem(compact ? 18 : 20)}
      className="text-muted-foreground shrink-0 animate-spin motion-reduce:animate-none"
    />
  );
}

interface ThinkingIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  /** Show the activity glyph before the label. Set to `false`
   *  for a text-only indicator (e.g. inline before a streamed reply). */
  showIcon?: boolean;
  /** Harbor: a truthful, stable provider activity label. */
  label?: string;
  /** Step on the size ladder. Wins over the surrounding SizeProvider. */
  size?: SizeVariant;
}

const ThinkingIndicator = forwardRef<HTMLDivElement, ThinkingIndicatorProps>(
  ({ className, showIcon = true, size, label, ...props }, ref) => {
    const words = label ? [label] : defaultWords;
    const compactStep = useSize(size).variant === "compact";
    const [index, setIndex] = useState(0);
    // Reduced motion drops the glyph rotation and the word cycling — a
    // static glyph and label carry the same meaning without the movement.
    const reduceMotion = useReducedMotion() ?? false;

    useEffect(() => {
      if (reduceMotion || label) return;
      const interval = setInterval(() => {
        setIndex((i) => (i + 1) % words.length);
      }, 4000);
      return () => clearInterval(interval);
    }, [reduceMotion, label]);

    return (
      <div
        ref={ref}
        role="status"
        className={cn("flex items-center gap-2 px-3 py-2", className)}
        {...props}
      >
        {/* Static announcement — the cycling word display below is aria-hidden
          so screen readers hear one "Thinking…" instead of a re-announcement
          every 4 seconds. */}
        <span className="sr-only">{label ?? "Thinking…"}</span>
        {showIcon && <ThinkingIndicatorGlyph size={size} />}
        {/* Every word sits in the same grid cell. overflow-hidden clips them
          as they roll in from below and out the top, like a slot. */}
        <span
          aria-hidden="true"
          className={cn(
            "inline-grid overflow-hidden",
            typeClass("body", compactStep ? "compact" : "default"),
          )}
          style={{ fontVariationSettings: fontWeights.normal }}
        >
          {/* An invisible copy of the longest word reserves the width, so the
            cycle never shifts what sits next to the indicator.
            `shimmer-text` ships with this component's CSS: transparent text
            over a 300%-wide gradient clipped to the letters, sweeping every
            1.5s. Its colors are light-dark() pairs, so the bright band
            inverts per theme. */}
          <span className="col-start-1 row-start-1 invisible shimmer-text">
            {words.reduce((a, b) => (a.length >= b.length ? a : b))}
          </span>
          {reduceMotion || label ? (
            <span className="col-start-1 row-start-1 shimmer-text">
              {words[0]}
            </span>
          ) : (
            // popLayout lets the outgoing word leave layout at once, so both
            // words overlap in the cell. The exit (0.16s) is quicker than the
            // entrance (0.24s): the old word clears before the new one lands.
            // initial={false}: the first word is already there on mount.
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={words[index]}
                className="col-start-1 row-start-1 shimmer-text"
                initial={{ y: "80%", opacity: 0 }}
                animate={{
                  y: 0,
                  opacity: 1,
                  transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] },
                }}
                exit={{
                  y: "-80%",
                  opacity: 0,
                  transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] },
                }}
              >
                {words[index]}
              </motion.span>
            </AnimatePresence>
          )}
        </span>
      </div>
    );
  },
);

ThinkingIndicator.displayName = "ThinkingIndicator";

export { ThinkingIndicator };
export type { ThinkingIndicatorProps };
export default ThinkingIndicator;
