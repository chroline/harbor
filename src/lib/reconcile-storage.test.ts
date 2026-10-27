// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { reconcileStorage } from "./reconcile-storage";
import { defaultProvider, supportedProviderId } from "./providers";
import { supportedProviders } from "./bindings/supported-providers";
afterEach(() => localStorage.clear());
it("removes deleted chat references and preserves working UI preferences", () => {
  for (const id of ["keep", "removed"]) {
    localStorage.setItem(`harbor.task-tabs.${id}`, '["parent"]');
    localStorage.setItem(`harbor.task-tab-selection.${id}`, "parent");
  }
  localStorage.setItem("harbor.last-view", JSON.stringify({session:"removed"}));
  localStorage.setItem("harbor.pinned-chats.v1", '["removed","keep"]');
  localStorage.setItem("harbor.unseen-turns.v1", '["removed","keep"]');
  localStorage.setItem("harbor.sidebar-order.v1", JSON.stringify({workspaces:["repo"],"chats:repo":["removed","keep"],pinned:["removed"]}));
  localStorage.setItem("harbor.sidebar", "preserve");
  for (let i=0;i<2;i++) reconcileStorage(localStorage, new Set(["keep"]));
  expect(localStorage.getItem("harbor.task-tabs.removed")).toBeNull();
  expect(localStorage.getItem("harbor.task-tab-selection.removed")).toBeNull();
  expect(localStorage.getItem("harbor.task-tab-selection.keep")).toBe("parent");
  expect(JSON.parse(localStorage.getItem("harbor.last-view")!)).toBe("home");
  expect(JSON.parse(localStorage.getItem("harbor.sidebar-order.v1")!)).toEqual({workspaces:["repo"],"chats:repo":["keep"],pinned:[]});
  expect(localStorage.getItem("harbor.pinned-chats.v1")).toBe('["keep"]');
  expect(localStorage.getItem("harbor.unseen-turns.v1")).toBe('["keep"]');
  expect(localStorage.getItem("harbor.sidebar")).toBe("preserve");
});
it("has three providers and rejects stale/custom IDs at command boundaries", () => {
  expect(supportedProviders.map((p) => p.id)).toEqual(["codex","claude","grok"]);
  expect(defaultProvider("claude")).toBe("claude");
  expect(defaultProvider("prime")).toBe("codex");
  expect(() => supportedProviderId("custom")).toThrow("Unsupported provider");
});
