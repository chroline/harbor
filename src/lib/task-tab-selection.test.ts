// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  readTaskTabSelection,
  saveTaskTabSelection,
} from "./task-tab-selection";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it("keeps independent terminal and worker selections for each task", () => {
  saveTaskTabSelection("one", "shell:shell:one:1");
  saveTaskTabSelection("two", "worker:two");
  expect(readTaskTabSelection("one")).toBe("shell:shell:one:1");
  expect(readTaskTabSelection("two")).toBe("worker:two");
  saveTaskTabSelection("one", "parent");
  expect(readTaskTabSelection("one")).toBe("parent");
  expect(readTaskTabSelection("two")).toBe("worker:two");
});

it("defaults to the parent tab when storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("unavailable");
  });
  expect(readTaskTabSelection("one")).toBe("parent");
});
