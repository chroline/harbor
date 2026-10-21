// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "./Settings";

const mock = vi.hoisted(() => ({
  call: vi.fn(),
  refresh: vi.fn(),
  setError: vi.fn(),
}));
vi.mock("../lib/api", () => ({
  desktop: true,
  call: mock.call,
  json: (value: unknown) => value,
}));
vi.mock("../lib/store", () => ({
  useStore: () => ({
    data: { providers: [], settings: { editor: "/Applications/Zed.app" } },
    refresh: mock.refresh,
    setError: mock.setError,
  }),
}));
beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
beforeEach(() => {
  vi.clearAllMocks();
  mock.call.mockImplementation(async (command: string) =>
    command === "list_editors"
      ? [
          { value: "/Applications/Zed.app", label: "Zed" },
          { value: "/Applications/Local Editor.app", label: "Local Editor" },
        ]
      : undefined,
  );
});
afterEach(cleanup);

it("lists only discovered apps and saves the selected application", async () => {
  const user = userEvent.setup();
  render(<Settings />);
  await waitFor(() => expect(mock.call).toHaveBeenCalledWith("list_editors"));
  const picker = screen.getByRole("combobox", { name: "External editor" });
  await waitFor(() => expect(picker.textContent).toContain("Zed"));
  expect(
    screen.queryByRole("textbox", { name: "Editor executable" }),
  ).toBeNull();
  await user.click(picker);
  expect(screen.getAllByRole("option").map((item) => item.textContent)).toEqual(
    ["Zed", "Local Editor"],
  );
  await user.click(screen.getByRole("option", { name: "Local Editor" }));
  await waitFor(() =>
    expect(mock.call).toHaveBeenCalledWith("save_settings", {
      settings: { editor: "/Applications/Local Editor.app" },
    }),
  );
});

it("disables the dropdown when no text editors are detected", async () => {
  mock.call.mockResolvedValue([]);
  render(<Settings />);
  const picker = screen.getByRole("combobox", { name: "External editor" });
  await waitFor(() => expect(picker.textContent).toContain("No editors found"));
  expect(picker.hasAttribute("disabled")).toBe(true);
});
