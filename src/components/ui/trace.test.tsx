// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
} from "./trace";

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
});
afterEach(cleanup);

it("does not render collapsed tool output during streaming updates", () => {
  const output = vi.fn((props: { text: string }) => <pre>{props.text}</pre>);
  const Output = output;
  const view = (text: string) => (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>Tool details</TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <Output text={text} />
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
  const { rerender } = render(view("first output"));
  rerender(view("updated output"));
  expect(output).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Tool details" }));
  expect(screen.getByText("updated output")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Tool details" }));
  expect(screen.queryByText("updated output")).toBeNull();
  output.mockClear();
  rerender(view("latest output"));
  expect(output).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Tool details" }));
  expect(screen.getByText("latest output")).toBeTruthy();
});
