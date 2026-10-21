// @vitest-environment jsdom
import { expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  MAX_ATTACHMENT_BYTES,
  prepareAttachments,
  validateAttachments,
  restoreDraftFiles,
  setDraftFiles,
  useDraftFiles,
} from "./attachments";

it("keeps newer draft files when a previous send fails and restores only to its conversation", () => {
  const older = new File(["old"], "old.txt");
  const newer = new File(["new"], "new.txt");
  setDraftFiles("recovery:root", [newer]);
  const { result, rerender, unmount } = renderHook(
    ({ key }) => useDraftFiles(key),
    { initialProps: { key: "recovery:root" } },
  );
  act(() => restoreDraftFiles("recovery:root", []));
  expect(result.current[0]).toEqual([newer]);
  act(() => restoreDraftFiles("recovery:root", [older, older]));
  expect(result.current[0]).toEqual([newer, older]);
  rerender({ key: "recovery:child" });
  expect(result.current[0]).toEqual([]);
  rerender({ key: "recovery:root" });
  expect(result.current[0]).toEqual([newer, older]);
  unmount();
  setDraftFiles("recovery:root", []);
});

it("encodes actual file bytes and retains file names and MIME types", async () => {
  expect(
    await prepareAttachments([
      new File(["hello"], "notes.txt", { type: "text/plain" }),
      new File([], "empty.bin"),
    ]),
  ).toEqual([
    { name: "notes.txt", mimeType: "text/plain", data: "aGVsbG8=" },
    { name: "empty.bin", mimeType: "application/octet-stream", data: "" },
  ]);
});

it("rejects oversized batches and too many attachments before reading", () => {
  expect(() =>
    validateAttachments(Array.from({ length: 11 }, () => new File([], "a"))),
  ).toThrow("up to 10");
  expect(() =>
    validateAttachments([
      { size: MAX_ATTACHMENT_BYTES },
      { size: 1 },
    ] as File[]),
  ).toThrow("20 MB");
});
