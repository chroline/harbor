// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cssLengthToPixels, pixelsToRem, rem, scaledSize } from "./units";

afterEach(() => { vi.restoreAllMocks(); });

it("expresses design sizes in rem without fixing the root font size", () => {
  expect(rem(8)).toBe("0.5rem");
  expect(rem(1)).toBe("0.0625rem");
  expect(rem("1.25rem")).toBe("1.25rem");
});

it("keeps measured positions and sidebar resizing accurate at a larger root size", () => {
  vi.spyOn(globalThis, "getComputedStyle").mockReturnValue({ fontSize: "20" } as CSSStyleDeclaration);
  expect(pixelsToRem(320)).toBe("16rem");
  expect(cssLengthToPixels("16rem")).toBe(320);
  expect(scaledSize(16)).toBe(20);
});
