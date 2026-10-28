"use client";

// Ported from the public demo's file-diff-DIyTJuPT.js on 2026-10-27.
// https://kobra.systems/components/file-diff
// Original DOM, classes, numbering, change runs, and token rendering retained.
// Harbor adaptations: TypeScript types, local imports, and px → rem dimensions.
import { useMemo } from "react";
import { Code } from "@/lib/icons";
import { rem } from "@/lib/units";
import { cn } from "@/lib/utils";
import { highlightCode, INK } from "@/lib/file-diff-highlight";
import "../file-diff.css";

export type DiffLine = { kind: "context" | "add" | "remove"; text: string };

export function numberLines(lines: DiffLine[], oldStart = 1, newStart = 1) {
  let old = oldStart;
  let next = newStart;
  return lines.map((line) => ({
    ...line,
    old: line.kind === "add" ? null : old++,
    new: line.kind === "remove" ? null : next++,
  }));
}

export function changeRuns(lines: DiffLine[]) {
  const runs: { kind: DiffLine["kind"]; count: number }[] = [];
  for (const { kind } of lines) {
    const last = runs.at(-1);
    if (last?.kind === kind) last.count += 1;
    else runs.push({ kind, count: 1 });
  }
  return runs;
}

const ROW = {
  context: { tint: "", mark: "", glyph: "" },
  add: { tint: "bg-success/8", mark: "text-success", glyph: "+" },
  remove: { tint: "bg-destructive/8", mark: "text-destructive", glyph: "-" },
};
const STRIPE = {
  context: "",
  add: "bg-success",
  remove:
    "bg-[repeating-linear-gradient(45deg,var(--destructive)_0_2px,transparent_2px_4px)] opacity-80",
};

export type FileDiffProps = {
  filename: string;
  lines: DiffLine[];
  language?: string;
  oldStart?: number;
  newStart?: number;
  className?: string;
  mode?: "diff" | "read";
  showHeader?: boolean;
};

export function FileDiff({
  filename,
  lines,
  language = "ts",
  oldStart = 1,
  newStart = 1,
  className,
  mode = "diff",
  showHeader = true,
}: FileDiffProps) {
  const numbered = useMemo(
    () => numberLines(lines, oldStart, newStart),
    [lines, oldStart, newStart],
  );
  const runs = useMemo(() => changeRuns(lines), [lines]);
  const tokens = useMemo(
    () => highlightCode(lines.map((line) => line.text).join("\n"), language),
    [lines, language],
  );
  const added = lines.filter((line) => line.kind === "add").length;
  const removed = lines.filter((line) => line.kind === "remove").length;

  return (
    <figure
      data-slot="file-diff"
      data-mode={mode}
      data-language={language}
      aria-label={showHeader ? undefined : filename}
      className={cn(
        "overflow-hidden rounded-xl border bg-card text-card-foreground [--diff-line:1.25rem]",
        className,
      )}
    >
      {showHeader && (
        <figcaption className="file-diff-heading flex items-center gap-2 border-b px-3 py-1.5">
          <Code
            size={rem(13)}
            strokeWidth={1.8}
            aria-hidden
            className="shrink-0 text-muted-foreground"
          />
          <span
            dir="auto"
            className="truncate font-mono text-xs text-foreground"
          >
            {filename}
          </span>
          {mode === "diff" && (
            <>
              <span
                aria-hidden
                className="ms-auto flex h-4 shrink-0 items-center gap-1.5 font-mono text-xs"
              >
                <span dir="ltr" className="text-success">
                  +{added}
                </span>
                <span dir="ltr" className="text-destructive">
                  -{removed}
                </span>
              </span>
              <span className="sr-only">
                {added} added, {removed} removed
              </span>
            </>
          )}
        </figcaption>
      )}
      <div dir="ltr" className="flex">
        {mode === "diff" && (
          <div aria-hidden className="file-diff-rail w-1.5 shrink-0 py-2">
            {runs.map(({ kind, count }, index) => (
              <div
                key={index}
                style={{ height: `calc(${count} * var(--diff-line))` }}
                className={cn("bg-clip-content py-px pl-0.5", STRIPE[kind])}
              />
            ))}
          </div>
        )}
        <div
          aria-hidden
          data-slot="file-diff-gutter"
          className="shrink-0 py-2 font-code text-[0.75rem] leading-5 text-muted-foreground/70 select-none"
        >
          {numbered.map((line, index) => (
            <div key={index} className={cn("flex", ROW[line.kind].tint)}>
              <span className="flex gap-2 border-r pr-2 pl-2.5">
                {mode === "diff" && (
                  <span className="file-diff-line-number">{line.old}</span>
                )}
                <span className="file-diff-line-number">{line.new}</span>
              </span>
              {mode === "diff" && (
                <span className={cn("min-w-[1ch] px-2.5", ROW[line.kind].mark)}>
                  {ROW[line.kind].glyph}
                </span>
              )}
            </div>
          ))}
        </div>
        <pre className="min-w-0 flex-1 overflow-x-auto py-2 font-code text-[0.75rem] leading-5">
          <code
            className={cn(
              "block w-max min-w-full font-code",
              `language-${language}`,
            )}
          >
            {numbered.map((line, index) => (
              <div
                key={index}
                className={cn(
                  "pr-4 pl-2",
                  ROW[line.kind].tint,
                  line.kind === "context" && "text-muted-foreground",
                )}
              >
                {line.kind === "context" ? null : (
                  <span className="sr-only select-none">
                    {line.kind === "add" ? "Added: " : "Removed: "}
                  </span>
                )}
                {tokens[index]?.map((token, tokenIndex) => (
                  <span
                    key={tokenIndex}
                    className={
                      token.token &&
                      (mode === "read" || line.kind !== "context")
                        ? INK[token.token]
                        : undefined
                    }
                  >
                    {token.text}
                  </span>
                ))}
                {"\n"}
              </div>
            ))}
          </code>
        </pre>
      </div>
    </figure>
  );
}
