import { useMemo } from "react";
import { FileDiff } from "./ui/file-diff";
import {
  fileChangeLines,
  fileDiffLanguage,
  type FilePatch,
  type FileDiffHunk,
} from "@/lib/file-diff";

/** Harbor event adapter; the vendored FileDiff remains independent of ACP. */
export function FileChange({
  filename,
  before,
  after,
}: {
  filename: string;
  before?: string | null;
  after?: string | null;
}) {
  const lines = useMemo(() => fileChangeLines(before, after), [before, after]);
  return (
    <div className="file-change">
      <FileDiff
        filename={filename}
        lines={lines}
        language={fileDiffLanguage(filename)}
      />
      {before === undefined && (
        <p className="file-change-note">Previous contents unavailable.</p>
      )}
      {after === undefined && (
        <p className="file-change-note">Updated contents unavailable.</p>
      )}
    </div>
  );
}

/** Read snapshots share the file panel, with one line gutter and no diff UI. */
export function FileRead({
  filename,
  text,
  start = 1,
}: {
  filename: string;
  text: string;
  start?: number;
}) {
  const snapshot = useMemo(() => {
    const plain = text.replace(/^```[^\n]*\n([\s\S]*?)\n```\s*$/, "$1");
    const rows = plain === "" ? [] : plain.replace(/\n$/, "").split("\n");
    const numbered = rows.map((row) => /^\s*(\d+)(?:\t|→)(.*)$/.exec(row));
    const first = Number(numbered[0]?.[1]);
    const hasNumbers =
      numbered.length > 0 &&
      numbered.every(
        (match, index) => match && Number(match[1]) === first + index,
      );
    return {
      start: hasNumbers ? first : start,
      lines: rows.map((row, index) => ({
        kind: "context" as const,
        text: hasNumbers ? numbered[index]![2] : row,
      })),
    };
  }, [text, start]);
  return (
    <div className="file-change">
      <FileDiff
        filename={filename}
        mode="read"
        lines={snapshot.lines}
        language={fileDiffLanguage(filename)}
        newStart={snapshot.start}
      />
    </div>
  );
}

function Hunk({
  filename,
  hunk,
  split,
}: {
  filename: string;
  hunk: FileDiffHunk;
  split: boolean;
}) {
  const language = fileDiffLanguage(filename);
  return split ? (
    <div className="file-diff-split">
      <FileDiff
        filename={`${filename} · Before`}
        language={language}
        lines={hunk.lines.filter((line) => line.kind !== "add")}
        oldStart={hunk.oldStart}
        newStart={hunk.oldStart}
      />
      <FileDiff
        filename={`${filename} · After`}
        language={language}
        lines={hunk.lines.filter((line) => line.kind !== "remove")}
        oldStart={hunk.newStart}
        newStart={hunk.newStart}
      />
    </div>
  ) : (
    <FileDiff filename={filename} language={language} {...hunk} />
  );
}

export function FilePatchDiff({
  patch,
  split = false,
}: {
  patch: FilePatch;
  split?: boolean;
}) {
  return (
    <div className="file-change">
      {patch.hunks.length ? (
        patch.hunks.map((hunk, index) => (
          <Hunk
            key={index}
            filename={patch.filename}
            hunk={hunk}
            split={split}
          />
        ))
      ) : (
        <FileDiff filename={patch.filename} lines={[]} />
      )}
      {patch.note && <p className="file-change-note">{patch.note}</p>}
    </div>
  );
}
