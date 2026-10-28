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

export type FileDiffHunk = {
  lines: DiffLine[];
  oldStart: number;
  newStart: number;
};
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
        hunks: patch.hunks.map((hunk) => ({
          oldStart: hunk.oldStart,
          newStart: hunk.newStart,
          lines: hunk.lines.flatMap((line): DiffLine[] => {
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
        })),
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
