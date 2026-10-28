// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Review } from "./Review";
import { call } from "../lib/api";

vi.mock("../lib/api", () => ({ call: vi.fn() }));
vi.mock("../lib/store", () => ({ useStore: () => ({ setError: vi.fn() }) }));
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("uses the file diff for unified, split, and individual tracked-file review", async () => {
  vi.mocked(call).mockResolvedValue({
    files: ["a.ts"],
    status: " M a.ts\0",
    diff: "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -8 +8,2 @@\n-old\n+new\n+next\n",
  });
  const { container } = render(<Review sessionId="test" onClose={() => {}} />);
  await screen.findByText("2 added, 1 removed");
  expect(container.querySelectorAll('[data-slot="file-diff"]')).toHaveLength(1);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Split" }), {
    button: 0,
    ctrlKey: false,
  });
  await screen.findByText("a.ts · Before");
  expect(container.querySelectorAll('[data-slot="file-diff"]')).toHaveLength(2);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Unified" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("button", { name: "a.ts" }));
  expect(screen.getByText("2 added, 1 removed")).toBeTruthy();
  expect(
    vi.mocked(call).mock.calls.some(([command]) => command === "read_file"),
  ).toBe(false);
});

it("loads an untracked file as additions and reports read errors as errors", async () => {
  vi.mocked(call).mockImplementation(async (...[command]) => {
    if (command === "get_review")
      return {
        files: ["new.txt", "failed.txt"],
        status: "?? new.txt\0?? failed.txt\0",
        diff: "",
      } as never;
    if (command === "read_file") return "new file\n" as never;
    throw new Error("unexpected command");
  });
  render(<Review sessionId="test" onClose={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: "new.txt" }));
  expect(await screen.findByText("1 added, 0 removed")).toBeTruthy();
  vi.mocked(call).mockRejectedValueOnce(
    new Error("Cannot preview binary file"),
  );
  fireEvent.click(screen.getByRole("button", { name: "failed.txt" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "Cannot preview binary file",
    ),
  );
  expect(screen.queryByText("1 added, 0 removed")).toBeNull();
});
