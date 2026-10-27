// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { readRootDraft, rootDraftKey, useRootDraft } from "./root-draft";
import { reconcileStorage } from "./reconcile-storage";
afterEach(() => { cleanup(); localStorage.clear(); });
it("persists before the database debounce or component cleanup and retains cleared drafts", () => {
  const first = renderHook(() => useRootDraft("chat", "old database text"));
  act(() => first.result.current[1]("unsent plan revision"));
  expect(readRootDraft("chat")).toBe("unsent plan revision");
  first.unmount();
  const restart = renderHook(() => useRootDraft("chat", "old database text"));
  expect(restart.result.current[0]).toBe("unsent plan revision");
  act(() => restart.result.current[1](""));
  restart.unmount();
  expect(renderHook(() => useRootDraft("chat", "old database text")).result.current[0]).toBe("");
});
it("receives detached edits and removes drafts for deleted sessions", () => {
  const view = renderHook(() => useRootDraft("chat", ""));
  act(() => {
    localStorage.setItem(rootDraftKey("chat"), "detached edit");
    window.dispatchEvent(new StorageEvent("storage", { key: rootDraftKey("chat") }));
  });
  expect(view.result.current[0]).toBe("detached edit");
  localStorage.setItem(rootDraftKey("removed"), "stale");
  reconcileStorage(localStorage, new Set(["chat"]));
  expect(readRootDraft("removed")).toBeUndefined();
  expect(readRootDraft("chat")).toBe("detached edit");
});
