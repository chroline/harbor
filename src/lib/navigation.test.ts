import { describe, expect, it } from "vitest";
import {
  initialHistory,
  pruneHistory,
  readSavedView,
  travel,
  visit,
} from "./navigation";
import { parseShellPreferences, sidebarWidthCeiling } from "./shell-layout";
describe("Harbor navigation history", () => {
  it("restores the saved task and safely rejects invalid saved views", () => {
    expect(readSavedView('{"session":"last-task"}')).toEqual({
      session: "last-task",
    });
    expect(readSavedView('"settings"')).toBe("settings");
    for (const value of [
      null,
      "broken",
      "42",
      '{"session":false}',
      '"unknown"',
    ])
      expect(readSavedView(value)).toBe("home");
    expect(
      pruneHistory(
        visit(initialHistory, readSavedView('{"session":"deleted"}')),
        new Set(),
      ),
    ).toEqual(initialHistory);
  });
  it("deduplicates selection and discards forward history on new navigation", () => {
    let h = visit(initialHistory, { session: "a" });
    expect(visit(h, { session: "a" })).toBe(h);
    h = visit(h, "settings");
    h = travel(h, -1);
    expect(h.entries[h.index]).toEqual({ session: "a" });
    h = visit(h, "worktrees");
    expect(h.entries).toEqual(["home", { session: "a" }, "worktrees"]);
    expect(travel(h, 1)).toBe(h);
    expect(travel(initialHistory, -1)).toBe(initialHistory);
  });
  it("skips deleted chats and preserves the current position", () => {
    const h = {
      entries: [
        "home",
        { session: "a" },
        "settings",
        { session: "b" },
      ] as const,
      index: 3,
    };
    const clean = pruneHistory(
      { ...h, entries: [...h.entries] },
      new Set(["a"]),
    );
    expect(clean).toEqual({
      entries: ["home", { session: "a" }, "settings"],
      index: 2,
    });
    expect(
      pruneHistory(
        { entries: ["home", { session: "a" }, "home"], index: 2 },
        new Set(),
      ),
    ).toEqual(initialHistory);
  });
});
describe("Sidebar preferences and bounds", () => {
  it("restores open state and width, and rejects invalid saved values", () => {
    expect(parseShellPreferences('{"open":false,"width":350}')).toEqual({
      open: false,
      width: 350,
    });
    expect(parseShellPreferences("broken")).toEqual({ open: true, width: 256 });
    expect(parseShellPreferences('{"open":"no","width":999}')).toEqual({
      open: true,
      width: 999,
    });
    expect(parseShellPreferences('{"width":-1}').width).toBe(230);
  });
  it("starts at Fluid's default width and clamps legacy widths to its bounds", () => {
    expect(parseShellPreferences(null)).toEqual({ open: true, width: 256 });
    expect(parseShellPreferences('{"open":false,"width":420}')).toEqual({
      open: false,
      width: 420,
    });
    expect(parseShellPreferences('{"open":false,"width":2000}')).toEqual({
      open: false,
      width: 2000,
    });
    expect(parseShellPreferences('{"width":280}').width).toBe(280);
    expect(parseShellPreferences('{"width":160}').width).toBe(230);
    expect(parseShellPreferences('{"width":"280"}').width).toBe(256);
    expect(parseShellPreferences('{"width":1e999}').width).toBe(256);
  });
  it("stops where the conversation column would start shrinking", () => {
    expect(sidebarWidthCeiling(1380)).toBe(560);
    expect(sidebarWidthCeiling(1920)).toBe(1100);
    expect(sidebarWidthCeiling(900)).toBe(230);
  });
});

it("persists worker navigation and distinguishes it from its project orchestrator", () => {
  const saved = readSavedView(JSON.stringify({ session: "project-root", child: "worker" }));
  expect(saved).toEqual({ session: "project-root", child: "worker" });
  const first = visit(initialHistory, { session: "project-root" });
  const worker = visit(first, saved);
  expect(worker.index).toBe(first.index + 1);
  expect(travel(worker, -1).entries[first.index]).toEqual({ session: "project-root" });
});
