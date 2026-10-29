// @vitest-environment jsdom
import { $getRoot, getNearestEditorFromDOMNode } from "lexical";
import { act } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { CommandEditor } from "./CommandEditor";
import { RichText } from "./shared";
import { fillEditor } from "../test/editor";
import type { CommandCatalog } from "../lib/command-catalog";
const catalog: CommandCatalog = {
  status: "ready",
  commands: [
    { name: "review", description: "Review changes" },
    { name: "$build", description: "Build" },
  ],
};
vi.mock("../lib/store", () => ({ useStore: () => ({ setError: vi.fn() }) }));
beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(cleanup);
function Harness({
  initial = "",
  state = catalog,
  submit = vi.fn(),
}: {
  initial?: string;
  state?: CommandCatalog;
  submit?: () => void;
}) {
  const [value, onValueChange] = useState(initial);
  return (
    <>
      <CommandEditor
        value={value}
        onValueChange={onValueChange}
        catalog={state}
        onSubmit={submit}
      />
      <output>{value}</output>
    </>
  );
}
it("disables native spelling and correction suggestions in the command editor", () => {
  render(<Harness />);
  const input = screen.getByRole("textbox");
  expect(input.getAttribute("autocorrect")).toBe("off");
  expect(input.getAttribute("autocapitalize")).toBe("off");
  expect(input.getAttribute("spellcheck")).toBe("false");
  act(() => getNearestEditorFromDOMNode(input)!.focus());
  expect(input.closest("[autocapitalize]")?.getAttribute("autocapitalize")).toBe("off");
});
it("highlights exact names, removes styling when edited, and preserves plain draft text", async () => {
  const { container } = render(<Harness initial="/review use $build" />);
  await waitFor(() =>
    expect(container.querySelectorAll(".command-reference")).toHaveLength(2),
  );
  const input = screen.getByRole("textbox");
  fillEditor(input, "/reviews use $building");
  await waitFor(() =>
    expect(input.querySelector(".command-reference")).toBeNull(),
  );
  expect(screen.getByRole("status").textContent).toBe("/reviews use $building");
});
it.each(["Enter", "Tab"])(
  "completes with %s without sending, then retains modifier submission",
  async (key) => {
    const submit = vi.fn();
    render(<Harness submit={submit} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fillEditor(input, "/rev");
    await screen.findByRole("option", { name: /\/review/ });
    fireEvent.keyDown(input, { key });
    await waitFor(() => expect(input.textContent).toBe("/review "));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    expect(submit).toHaveBeenCalledOnce();
  },
);
it("dismisses with Escape and reopens on a new query, without opening during composition", async () => {
  render(<Harness />);
  const input = screen.getByRole("textbox");
  fireEvent.focus(input);
  fillEditor(input, "$b");
  await screen.findByRole("listbox");
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
  fillEditor(input, "$bu");
  await screen.findByRole("listbox");
  fireEvent.keyDown(input, { key: "Enter" });
  fillEditor(input, "$bu");
  await screen.findByRole("listbox");
  fireEvent.compositionStart(input);
  expect(screen.queryByRole("listbox")).toBeNull();
  fireEvent.compositionEnd(input);
  // jsdom does not perform the native beforeinput/selection update of an IME.
  fillEditor(input, "$bui");
  await screen.findByRole("listbox");
});
it("shows discovery states and exposes retry without submitting", async () => {
  const retry = vi.fn();
  render(<Harness state={{ commands: [], status: "error", retry }} />);
  const input = screen.getByRole("textbox");
  fireEvent.focus(input);
  fillEditor(input, "/");
  fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
  expect(retry).toHaveBeenCalledOnce();
});
it("decorates sent prose without changing code, link rendering or source text", () => {
  const text = "/review `$build` [link](https://example.com)";
  const { container } = render(
    <RichText
      text={text}
      commandRanges={[
        { start: 0, end: 7 },
        { start: 9, end: 15 },
      ]}
    />,
  );
  expect(container.querySelectorAll(".command-reference")).toHaveLength(1);
  expect(container.querySelector("code")?.textContent).toBe("$build");
  expect(container.querySelector("a")?.getAttribute("href")).toBe(
    "https://example.com",
  );
});

it("rechecks adjacent tokens when deleting their word boundary", async () => {
  render(<Harness initial="use $build" />);
  const input = screen.getByRole("textbox");
  await waitFor(() =>
    expect(input.querySelector(".command-reference")).toBeTruthy(),
  );
  act(() =>
    getNearestEditorFromDOMNode(input)!.update(
      () => {
        $getRoot().getAllTextNodes()[0].spliceText(3, 1, "");
      },
      { discrete: true },
    ),
  );
  expect(input.textContent).toBe("use$build");
  expect(input.querySelector(".command-reference")).toBeNull();
});

it("offers the same menu for both triggers, with readable labels and a skills section", async () => {
  render(<Harness />);
  const input = screen.getByRole("textbox");
  fireEvent.focus(input);
  fillEditor(input, "/");
  await screen.findByRole("option", { name: "Review /review" });
  expect(screen.getByRole("option", { name: "Build $build" })).toBeTruthy();
  expect(screen.getByText("Skills")).toBeTruthy();
  const slash = screen
    .getAllByRole("option")
    .map((node) => node.getAttribute("aria-label"));
  fillEditor(input, "$");
  expect(
    screen
      .getAllByRole("option")
      .map((node) => node.getAttribute("aria-label")),
  ).toEqual(slash);
  fillEditor(input, "/bu");
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(input.textContent).toBe("$build "));
  fillEditor(input, "$rev");
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(input.textContent).toBe("/review "));
});
