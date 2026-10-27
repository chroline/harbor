"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import "./streaming-text.css";

// Public contract from https://kobra.systems/components/streaming-text.
// `children` is the reply so far. Newly arrived words appear one every
// `wordMs` (default 16) and fade in.
// Words already present when this mounts stay visible, so opening a live
// reply does not replay it from the first word.

const WORD_SPLIT = /(\s+)/;

function splitWords(text: string) {
  return text.split(WORD_SPLIT);
}

function isWord(part: string) {
  return part !== "" && !/^\s+$/.test(part);
}

function countWords(parts: string[]) {
  let count = 0;
  for (const part of parts) if (isWord(part)) count += 1;
  return count;
}

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function reducedMotionNow() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface StreamingTextProps {
  /** The reply so far. */
  children: string;
  className?: string;
  /** Milliseconds between words that arrive after mount. */
  wordMs?: number;
}

function StreamingText({
  children,
  className,
  wordMs = 16,
}: StreamingTextProps) {
  const parts = useMemo(() => splitWords(children), [children]);
  const count = countWords(parts);
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionNow,
    () => false,
  );
  const presentOnMount = useRef(count);
  const shownRef = useRef(count);
  const [shown, setShown] = useState(count);

  useEffect(() => {
    if (reduced || wordMs <= 0 || shownRef.current >= count) {
      if (shownRef.current !== count) {
        shownRef.current = count;
        setShown(count);
      }
      return;
    }
    const timer = window.setInterval(() => {
      const next = Math.min(count, shownRef.current + 1);
      shownRef.current = next;
      setShown(next);
      if (next >= count) window.clearInterval(timer);
    }, wordMs);
    return () => window.clearInterval(timer);
  }, [count, reduced, wordMs]);

  let wordIndex = 0;
  let pending = "";
  let caughtUp = false;
  const visible: ReactNode[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!;
    if (!isWord(part)) {
      pending += part;
      continue;
    }
    if (wordIndex >= shown) {
      caughtUp = true;
      break;
    }
    if (pending) visible.push(pending);
    pending = "";
    visible.push(
      <span
        key={index}
        className={
          !reduced && wordIndex >= presentOnMount.current
            ? "streaming-word"
            : undefined
        }
      >
        {part}
      </span>,
    );
    wordIndex += 1;
  }
  if (!caughtUp && pending) visible.push(pending);

  return (
    <span
      data-slot="streaming-text"
      className={cn("streaming-text", className)}
    >
      {visible}
    </span>
  );
}

export { StreamingText };
export type { StreamingTextProps };
