import { diffLines, parsePatch } from "diff";
import type { DiffLine } from "@/components/ui/file-diff";

function lines(text: string) {
  return text === "" ? [] : text.replace(/\n$/, "").split("\n");
}

/** Missing old contents are unknown; null explicitly denotes a new file. */
export function fileChangeLines(
  before: string | null | undefined,
  after: string | null | undefined,
): DiffLine[] {
  if (before === undefined)
    return lines(after ?? "").map((text) => ({ kind: "context", text }));
  if (after === undefined)
    return lines(before ?? "").map((text) => ({ kind: "context", text }));
  const changes = diffLines(before ?? "", after ?? "", { timeout: 100 });
  if (!changes) {
    // A bounded diff may give up on a large replacement. Both snapshots are
    // still accurate, so show a whole-file replacement rather than hide it.
    return [
      ...lines(before ?? "").map((text): DiffLine => ({
        kind: "remove",
        text,
      })),
      ...lines(after ?? "").map((text): DiffLine => ({ kind: "add", text })),
    ];
  }
  return changes.flatMap((change) =>
    lines(change.value).map((text): DiffLine => ({
      kind: change.added ? "add" : change.removed ? "remove" : "context",
      text,
    })),
  );
}

/** Added and removed line counts for a before/after pair; unknown sides count nothing. */
export function diffStats(
  before: string | null | undefined,
  after: string | null | undefined,
) {
  if (before === undefined || after === undefined)
    return { added: 0, removed: 0 };
  const changed = fileChangeLines(before, after);
  return {
    added: changed.filter((line) => line.kind === "add").length,
    removed: changed.filter((line) => line.kind === "remove").length,
  };
}

export type FileDiffHunk = {
  lines: DiffLine[];
  oldStart: number;
  newStart: number;
};

/** Unchanged lines shown before and after each change. */
export const DIFF_CONTEXT = 4;

/**
 * Keep only the context near a change. Lines further away are dropped and the
 * diff splits into hunks, each carrying its own line numbers so the omitted
 * lines do not shift them. A diff with no changes is returned whole.
 */
export function trimContext(
  lines: DiffLine[],
  oldStart = 1,
  newStart = 1,
  context = DIFF_CONTEXT,
): FileDiffHunk[] {
  const keep = lines.map(() => false);
  lines.forEach((line, index) => {
    if (line.kind === "context") return;
    const from = Math.max(0, index - context);
    const to = Math.min(lines.length - 1, index + context);
    for (let i = from; i <= to; i++) keep[i] = true;
  });
  if (!keep.some(Boolean)) return [{ lines, oldStart, newStart }];
  // Hiding a single line saves nothing; show it.
  for (let i = 1; i < lines.length - 1; i++)
    if (!keep[i] && keep[i - 1] && keep[i + 1]) keep[i] = true;
  const hunks: FileDiffHunk[] = [];
  let oldLine = oldStart;
  let newLine = newStart;
  lines.forEach((line, index) => {
    if (keep[index]) {
      if (!keep[index - 1] || index === 0)
        hunks.push({ lines: [], oldStart: oldLine, newStart: newLine });
      hunks[hunks.length - 1].lines.push(line);
    }
    if (line.kind !== "add") oldLine++;
    if (line.kind !== "remove") newLine++;
  });
  return hunks;
}
export type FilePatch = {
  filename: string;
  hunks: FileDiffHunk[];
  note?: string;
};

/** Each hunk keeps its own offsets; omitted context must not shift numbers. */
export function filePatches(text: string): FilePatch[] {
  try {
    return parsePatch(text).map((patch) => {
      const path =
        patch.newFileName === "/dev/null"
          ? patch.oldFileName
          : (patch.newFileName ?? patch.oldFileName);
      return {
        filename: path?.replace(/^[ab]\//, "") ?? "File changes",
        hunks: patch.hunks.flatMap((hunk) =>
          trimContext(
            hunk.lines.flatMap((line): DiffLine[] => {
              const kind =
                line[0] === "+"
                  ? "add"
                  : line[0] === "-"
                    ? "remove"
                    : line[0] === " "
                      ? "context"
                      : undefined;
              return kind ? [{ kind, text: line.slice(1) }] : [];
            }),
            hunk.oldStart,
            hunk.newStart,
          ),
        ),
        note: patch.isBinary
          ? "Binary file changed."
          : !patch.hunks.length
            ? patch.isRename
              ? `Renamed from ${patch.oldFileName?.replace(/^a\//, "")}.`
              : patch.oldMode !== patch.newMode
                ? `File mode changed from ${patch.oldMode ?? "none"} to ${patch.newMode ?? "none"}.`
                : "File metadata changed."
            : undefined,
      };
    });
  } catch {
    return [];
  }
}

export function fileDiffLanguage(filename: string) {
  return filename.split(".").at(-1)?.toLowerCase() ?? "text";
}
