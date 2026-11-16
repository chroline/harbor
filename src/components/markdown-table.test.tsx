// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { RichText } from "./shared";

vi.mock("../lib/store", () => ({ useStore: () => ({ setError: vi.fn() }) }));
afterEach(cleanup);

const table = `| Language | Since | GC |
| :-- | --: | --- |
| Python | 1991 | Yes |
| Rust | 2015 | No |`;

it("renders markdown tables with the shared table primitives", () => {
  const { container } = render(<RichText text={table} />);
  expect(container.querySelector('[data-slot="table-container"]')).toBeTruthy();
  expect(container.querySelector('[data-slot="table-header"]')).toBeTruthy();
  expect(container.querySelectorAll('[data-slot="table-head"]')).toHaveLength(3);
  expect(container.querySelectorAll('[data-slot="table-row"]')).toHaveLength(3);
  const cells = container.querySelectorAll('[data-slot="table-cell"]');
  expect(Array.from(cells, (c) => c.textContent)).toEqual([
    "Python", "1991", "Yes", "Rust", "2015", "No",
  ]);
  // Column alignment from the markdown survives.
  expect((cells[1] as HTMLElement).style.textAlign).toBe("right");
});
