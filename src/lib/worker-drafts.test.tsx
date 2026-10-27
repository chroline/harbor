// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { readWorkerDrafts, useWorkerDrafts, workerDraftKey } from "./worker-drafts";
import { reconcileStorage } from "./reconcile-storage";
afterEach(() => { cleanup(); localStorage.clear(); });
it("keeps worker drafts through remount and preserves independent worker edits", () => {
  const view = renderHook(() => useWorkerDrafts("root"));
  act(() => view.result.current[1]("first", "unsent first"));
  // Another window edits another worker before this window receives its storage event.
  localStorage.setItem(workerDraftKey("root"), JSON.stringify({ first: "unsent first", second: "unsent second" }));
  act(() => view.result.current[1]("first", (previous) => `${previous} updated`));
  view.unmount();
  const restarted = renderHook(() => useWorkerDrafts("root"));
  expect(restarted.result.current[0]).toEqual({ first: "unsent first updated", second: "unsent second" });
  act(() => restarted.result.current[1]("first", ""));
  expect(readWorkerDrafts("root")).toEqual({ first: "", second: "unsent second" });
});
it("reconciles deleted roots and receives detached-window edits", () => {
  const view = renderHook(() => useWorkerDrafts("kept"));
  act(() => {
    localStorage.setItem(workerDraftKey("kept"), JSON.stringify({ child: "detached edit" }));
    window.dispatchEvent(new StorageEvent("storage", { key: workerDraftKey("kept") }));
  });
  expect(view.result.current[0].child).toBe("detached edit");
  localStorage.setItem(workerDraftKey("removed"), JSON.stringify({ child: "obsolete" }));
  reconcileStorage(localStorage, new Set(["kept"]));
  expect(readWorkerDrafts("kept").child).toBe("detached edit");
  expect(localStorage.getItem(workerDraftKey("removed"))).toBeNull();
});
