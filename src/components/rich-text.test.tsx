// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { RichText } from "./shared";

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => {
    parse(children);
    return <p>{children}</p>;
  },
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("does not parse saved messages again while the composer changes, but renders streamed text", () => {
  function Conversation({ text }: { text: string }) {
    const [draft, setDraft] = useState("");
    return <>
      <RichText text={text} />
      <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
    </>;
  }
  const { rerender } = render(<Conversation text="Existing **answer**" />);
  const initial = parse.mock.calls.length;
  for (const draft of ["t", "ty", "typ", "typing"])
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: draft } });
  expect(parse.mock.calls.length).toBe(initial);
  rerender(<Conversation text="Existing **answer** with a streamed addition" />);
  expect(parse).toHaveBeenLastCalledWith("Existing **answer** with a streamed addition");
  expect(parse.mock.calls.length).toBe(initial + 1);
});

it("reparses user text when its advertised command ranges change", () => {
  const { rerender } = render(<RichText text="Run /status" commandRanges={[]} />);
  const initial = parse.mock.calls.length;
  rerender(<RichText text="Run /status" commandRanges={[{ start: 4, end: 11 }]} />);
  expect(parse.mock.calls.length).toBe(initial + 1);
});
