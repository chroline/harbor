import { describe, expect, it } from "vitest";
import {
  moveSidebarItem,
  orderSidebarItems,
  parseSidebarOrder,
} from "./sidebar-order";

describe("saved sidebar order", () => {
  it("tolerates invalid storage and sanitizes individual groups", () => {
    for (const raw of [null, "bad json", "[]", "null", "42"])
      expect(parseSidebarOrder(raw)).toEqual({});
    expect(
      parseSidebarOrder('{"projects":["b",null,"a","b",7],"workspaces":false}'),
    ).toEqual({ projects: ["b", "a"] });
  });

  it("keeps saved order through incoming list changes, skips removed items and appends new items", () => {
    const items = [{ id: "a" }, { id: "new" }, { id: "b" }];
    expect(
      orderSidebarItems(items, ["b", "deleted", "a", "a"], (item) => item.id),
    ).toEqual([items[2], items[0], items[1]]);
    expect(orderSidebarItems(items, undefined, (item) => item.id)).toEqual(
      items,
    );
  });

  it("inserts on either side of the target in both directions", () => {
    const ids = ["a", "b", "c", "d"];
    expect(moveSidebarItem(ids, "a", "c", "after")).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
    expect(moveSidebarItem(ids, "d", "b", "before")).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
    expect(moveSidebarItem(ids, "b", "c", "before")).toEqual(ids);
    expect(moveSidebarItem(ids, "missing", "c", "after")).toBe(ids);
    expect(moveSidebarItem(ids, "a", "missing", "after")).toBe(ids);
  });
});
