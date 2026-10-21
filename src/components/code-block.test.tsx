// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { CodeBlock } from "./CodeBlock";
import { RichText } from "./shared";

const { setError } = vi.hoisted(() => ({ setError: vi.fn() }));
vi.mock("../lib/store", () => ({ useStore: () => ({ setError }) }));
beforeAll(() => {
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
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("preserves Markdown code wrapping when the parent rerenders or code streams", () => {
  const view = render(<RichText text={"```ts\nconst n = 1;\n```"} />);
  fireEvent.click(screen.getByRole("button", { name: "Wrap lines" }));
  view.rerender(<RichText text={"```ts\nconst n = 1;\n```"} />);
  expect(
    screen
      .getByRole("button", { name: "Wrap lines" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  view.rerender(
    <RichText text={"```ts\nconst n = 1;\nconst next = n + 1;\n```"} />,
  );
  expect(
    screen
      .getByRole("button", { name: "Wrap lines" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});

it("copies source verbatim including blank lines and trailing newlines with one copy control", async () => {
  const source = "const n = 1;\n\n\nconst empty = '';\n";
  const { container } = render(
    <CodeBlock text={source} language="typescript" title="example.ts" />,
  );
  expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(1);
  expect(
    container
      .querySelector('[data-slot="code-block-content"]')
      ?.getAttribute("data-numbered"),
  ).toBe("true");
  expect(container.querySelector(".hljs-keyword")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await waitFor(() =>
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(source),
  );
  expect(screen.getByText("example.ts")).toBeTruthy();
});

it("wraps unknown languages and renders compact output without line numbers", () => {
  const { container } = render(
    <CodeBlock text={"one\n\ntwo\n"} language="unknown-lang" compact />,
  );
  const pre = container.querySelector("pre")!;
  expect(pre.textContent).toBe("one\n\ntwo\n");
  expect(pre.hasAttribute("data-numbered")).toBe(false);
  const wrap = screen.getByRole("button", { name: "Wrap lines" });
  fireEvent.click(wrap);
  expect(wrap.getAttribute("aria-pressed")).toBe("true");
  expect(pre.getAttribute("data-wrap")).toBe("true");
});

it("renders an unfinished Markdown fence through the same block while preserving inline code", () => {
  const view = render(
    <RichText text={"Use `n`.\n\n```typescript\nconst n ="} />,
  );
  expect(
    view.container.querySelectorAll('[data-slot="code-block"]'),
  ).toHaveLength(1);
  expect(view.container.querySelector("p > code")?.textContent).toBe("n");
  view.rerender(
    <RichText text={"Use `n`.\n\n```typescript\nconst n = 1;\n\n```"} />,
  );
  expect(
    view.container.querySelectorAll('[data-slot="code-block"]'),
  ).toHaveLength(1);
  expect(
    view.container.querySelectorAll('[data-slot="code-block-line"]'),
  ).toHaveLength(2);
  expect(
    view.container.querySelector('[data-slot="code-block-content"]')
      ?.textContent,
  ).toContain("const n = 1;");
});

it("marks real diff lines and copies the resulting file, excluding removed lines", async () => {
  const before = "first\nold\n";
  const after = "first\nnew\n\n";
  const { container } = render(
    <CodeBlock text={after} diff={{ before, after }} compact />,
  );
  expect(
    container.querySelector(
      '[data-slot="code-block-line"][data-variant="removed"]',
    )?.textContent,
  ).toBe("old");
  expect(
    container.querySelector(
      '[data-slot="code-block-line"][data-variant="added"]',
    )?.textContent,
  ).toBe("new");
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await waitFor(() =>
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(after),
  );
});

it("reports a clipboard failure without claiming the code was copied", async () => {
  vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
    new Error("denied"),
  );
  render(<CodeBlock text="output" />);
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await waitFor(() =>
    expect(setError).toHaveBeenCalledWith("Could not copy: Error: denied"),
  );
  expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
});
