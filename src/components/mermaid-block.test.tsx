// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RichText } from "./shared";
import { renderMermaid } from "../lib/mermaid";

vi.mock("../lib/mermaid", () => ({ renderMermaid: vi.fn() }));
vi.mock("../lib/store", () => ({ useStore: () => ({ setError: vi.fn() }) }));
const image =
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E";
const source = "flowchart TD\nA[Start] --> B[Done]\n";
const fence = (text: string) => `\`\`\`mermaid\n${text}\n\`\`\``;

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});
beforeEach(() => {
  vi.mocked(renderMermaid).mockResolvedValue(image);
});
afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
  vi.resetAllMocks();
});

it("renders Mermaid fences as diagrams, with source inspection and verbatim copying", async () => {
  render(<RichText text={fence(source)} />);
  expect(
    await screen.findByRole("img", { name: "Mermaid diagram" }),
  ).toBeTruthy();
  expect(renderMermaid).toHaveBeenCalledWith(
    source,
    false,
    expect.any(Function),
  );
  fireEvent.click(screen.getByRole("button", { name: "Show Mermaid source" }));
  expect(document.querySelector("pre")?.textContent).toBe(source);
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await waitFor(() =>
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(source),
  );
  fireEvent.click(screen.getByRole("button", { name: "Show Mermaid source" }));
  expect(screen.getByRole("img", { name: "Mermaid diagram" })).toBeTruthy();
});

it("expands into a zoomable lightbox and restores keyboard focus on Escape", async () => {
  const user = userEvent.setup();
  render(<RichText text={fence(source)} />);
  await screen.findByRole("img", { name: "Mermaid diagram" });
  const expand = screen.getByRole("button", { name: "Expand diagram" });
  await user.click(expand);
  const dialog = await screen.findByRole("dialog", { name: "Mermaid diagram" });
  expect(
    within(dialog).getByRole("img", { hidden: true }).getAttribute("src"),
  ).toBe(image);
  await user.click(within(dialog).getByRole("button", { name: "Zoom in" }));
  expect(
    within(dialog).getByRole("button", { name: "Reset diagram zoom" })
      .textContent,
  ).toBe("125%");
  await user.click(
    within(dialog).getByRole("button", { name: "Reset diagram zoom" }),
  );
  expect(
    within(dialog).getByRole("button", { name: "Reset diagram zoom" })
      .textContent,
  ).toBe("100%");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(expand);
  expect(renderMermaid).toHaveBeenCalledTimes(1);
});

it("falls back to source on invalid or unfinished diagrams and recovers when the stream completes", async () => {
  vi.mocked(renderMermaid).mockRejectedValueOnce(new Error("parse error"));
  const view = render(<RichText text={"```mermaid\nflowchart TD\nA["} />);
  expect(
    await screen.findByText("Diagram preview unavailable. Showing source."),
  ).toBeTruthy();
  expect(document.querySelector("pre")?.textContent).toBe("flowchart TD\nA[");
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Expand diagram" })
      .disabled,
  ).toBe(true);
  view.rerender(<RichText text={fence(source)} />);
  expect(
    await screen.findByRole("img", { name: "Mermaid diagram" }),
  ).toBeTruthy();
  expect(
    screen.queryByText("Diagram preview unavailable. Showing source."),
  ).toBeNull();
});

it("ignores late renders for old source and rerenders when the app theme changes", async () => {
  let resolveOld!: (value: string) => void;
  vi.mocked(renderMermaid).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  const view = render(<RichText text={fence("flowchart TD\nA --> B")} />);
  await waitFor(() => expect(renderMermaid).toHaveBeenCalledTimes(1));
  const cancelled = vi.mocked(renderMermaid).mock.calls[0][2];
  view.rerender(<RichText text={fence(source)} />);
  expect(cancelled()).toBe(true);
  await screen.findByRole("img", { name: "Mermaid diagram" });
  await act(async () => {
    resolveOld("stale-image");
  });
  expect(screen.getByRole("img").getAttribute("src")).toBe(image);
  act(() => {
    document.documentElement.classList.add("dark");
  });
  await waitFor(() =>
    expect(renderMermaid).toHaveBeenLastCalledWith(
      source,
      true,
      expect.any(Function),
    ),
  );
  expect(
    await screen.findByRole("img", { name: "Mermaid diagram" }),
  ).toBeTruthy();
});
