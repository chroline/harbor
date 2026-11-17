// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FileDiff } from "./ui/file-diff";
import { FileChange, FilePatchDiff } from "./FileDiff";
import { diffStats, fileChangeLines, filePatches, trimContext } from "@/lib/file-diff";

afterEach(cleanup);

const demo = [
  { kind: "context", text: "export function getToken() {" },
  { kind: "remove", text: "  return localStorage.token;" },
  { kind: "add", text: '  const t = cookies.get("session");' },
  { kind: "add", text: '  if (!t) throw new Error("no session");' },
  { kind: "add", text: "  return t;" },
  { kind: "context", text: "}" },
] as const;

it("preserves the shipped demo's numbers, change runs, and changed-only highlighting", () => {
  const { container } = render(
    <FileDiff
      filename="src/auth.ts"
      lines={[...demo]}
      oldStart={12}
      newStart={12}
    />,
  );
  const body = container.querySelector("figure > div")!;
  // The rail and line numbers share one sticky wrapper; the +/- marks are a
  // separate column so they scroll away with the code.
  const [rail, gutter] = body.children[0].children;
  expect(
    [...rail.children].map((run) => (run as HTMLElement).style.height),
  ).toEqual([
    "calc(1 * var(--diff-line))",
    "calc(1 * var(--diff-line))",
    "calc(3 * var(--diff-line))",
    "calc(1 * var(--diff-line))",
  ]);
  expect(
    [...gutter.children].map((row) =>
      [...row.querySelectorAll("span > span")].map((cell) => cell.textContent),
    ),
  ).toEqual([
    ["12", "12"],
    ["13", ""],
    ["", "13"],
    ["", "14"],
    ["", "15"],
    ["14", "16"],
  ]);
  const codeRows = container.querySelectorAll("pre code > div");
  expect(codeRows[0].querySelector(".text-info")).toBeNull();
  expect(codeRows[1].querySelector(".text-info")?.textContent).toBe("return");
  expect(codeRows[2].querySelector(".text-success")?.textContent).toBe(
    '"session"',
  );
  expect(screen.getByText("3 added, 1 removed")).toBeTruthy();
});

it("preserves blank lines without inventing a line for an empty file", () => {
  expect(fileChangeLines("first\nold\n", "first\nnew\n\n")).toEqual([
    { kind: "context", text: "first" },
    { kind: "remove", text: "old" },
    { kind: "add", text: "new" },
    { kind: "add", text: "" },
  ]);
  expect(fileChangeLines(null, "")).toEqual([]);
  expect(fileChangeLines("old\n", null)).toEqual([
    { kind: "remove", text: "old" },
  ]);
});

it("distinguishes known new files from writes with no previous snapshot", () => {
  const view = render(<FileChange filename="a.txt" after="hello\n" />);
  expect(screen.getByText("Previous contents unavailable.")).toBeTruthy();
  expect(screen.getByText("0 added, 0 removed")).toBeTruthy();
  view.rerender(<FileChange filename="a.txt" before={null} after="hello\n" />);
  expect(screen.getByText("1 added, 0 removed")).toBeTruthy();
  expect(screen.queryByText("Previous contents unavailable.")).toBeNull();
});

it("keeps real hunk offsets and treats header-like code as changed lines", () => {
  const patches = filePatches(
    "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -12,2 +12,2 @@\n same\n---- old\n++++ new\n@@ -80 +80 @@\n-old\n+new\n\\ No newline at end of file\n",
  );
  expect(patches).toHaveLength(1);
  expect(patches[0].filename).toBe("a.txt");
  expect(patches[0].hunks.map((hunk) => hunk.oldStart)).toEqual([12, 80]);
  expect(patches[0].hunks[0].lines[1]).toEqual({
    kind: "remove",
    text: "--- old",
  });
  expect(patches[0].hunks[1].lines).toHaveLength(2);
  const { container } = render(<FilePatchDiff patch={patches[0]} />);
  expect(container.querySelectorAll('[data-slot="file-diff"]')).toHaveLength(2);
  expect(screen.getAllByText("80")).toHaveLength(2);
});

it("keeps multi-file deletions, binary changes, and rename-only changes visible", () => {
  const patches = filePatches(
    "diff --git a/old.txt b/old.txt\ndeleted file mode 100644\n--- a/old.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\ndiff --git a/image.png b/image.png\nindex 123..456 100644\nBinary files a/image.png and b/image.png differ\ndiff --git a/a.txt b/b.txt\nsimilarity index 100%\nrename from a.txt\nrename to b.txt\n",
  );
  expect(patches.map((patch) => patch.filename)).toEqual([
    "old.txt",
    "image.png",
    "b.txt",
  ]);
  expect(patches[1].note).toBe("Binary file changed.");
  expect(patches[2].note).toContain("Renamed from");
  const { container } = render(<FilePatchDiff patch={patches[0]} split />);
  expect(container.querySelectorAll('[data-slot="file-diff"]')).toHaveLength(2);
  expect(screen.getByText("0 added, 1 removed")).toBeTruthy();
});

it("keeps four lines of context around each change and numbers each hunk", () => {
  const body = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`);
  const before = body(40).join("\n");
  const after = body(40)
    .map((text, i) => (i === 9 || i === 29 ? `${text} changed` : text))
    .join("\n");
  const hunks = trimContext(fileChangeLines(before, after));
  expect(hunks).toHaveLength(2);
  // Lines 6-9 before the change, the change itself, lines 11-14 after.
  expect(hunks[0]).toMatchObject({ oldStart: 6, newStart: 6 });
  expect(hunks[0].lines.map((line) => line.text)).toEqual([
    "line 6", "line 7", "line 8", "line 9",
    "line 10", "line 10 changed",
    "line 11", "line 12", "line 13", "line 14",
  ]);
  expect(hunks[1]).toMatchObject({ oldStart: 26, newStart: 26 });
  expect(hunks[1].lines).toHaveLength(10);
  // No changes: nothing to anchor context to, so the whole file stays.
  expect(trimContext(fileChangeLines(before, before))).toHaveLength(1);

  const { container } = render(<FileChange filename="a.ts" before={before} after={after} />);
  expect(container.querySelectorAll('[data-slot="file-diff"]')).toHaveLength(2);
});

it("counts added and removed lines, and nothing when a side is unknown", () => {
  expect(diffStats("a\nb\n", "a\nc\nd\n")).toEqual({ added: 2, removed: 1 });
  expect(diffStats(null, "x\ny\n")).toEqual({ added: 2, removed: 0 });
  expect(diffStats(undefined, "x\n")).toEqual({ added: 0, removed: 0 });
});
