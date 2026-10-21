// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlanTrace, SubagentTrace, TraceStep } from "./AgentTrace";

beforeAll(() => {
  window.matchMedia = vi
    .fn()
    .mockImplementation(() => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }));
});
afterEach(cleanup);

it("keeps pending plan entries visible with accurate states and counts", () => {
  const { container } = render(
    <PlanTrace
      entries={[
        { content: "Inspect", status: "completed" },
        { content: "Implement", status: "in_progress" },
        { content: "Verify", status: "pending" },
      ]}
    />,
  );
  expect(screen.getByText("Plan · 1 of 3")).toBeTruthy();
  expect(
    container.querySelector('[data-status="pending"]')?.textContent,
  ).toContain("Verify");
  expect(
    container.querySelector('[data-status="running"]')?.textContent,
  ).toContain("Implement");
});

it("shows real worker status and opens the selected worker ID", () => {
  const onSelect = vi.fn();
  render(
    <SubagentTrace
      onSelect={onSelect}
      workers={[
        {
          sessionId: "worker-73",
          parentId: "root",
          title: "Lighthouse",
          description: null,
          state: { type: "needs_input" },
          capabilities: {},
        },
      ]}
    />,
  );
  expect(screen.getByText("needs input")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Open Lighthouse conversation" }),
  );
  expect(onSelect).toHaveBeenCalledWith("worker-73");
});

it("opens newly failed details unless the reader has explicitly collapsed them", () => {
  const view = render(
    <TraceStep label="Run checks" status="running" detailLabel="Details">
      Output
    </TraceStep>,
  );
  expect(
    screen
      .getByRole("button", { name: "Details" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  view.rerender(
    <TraceStep
      label="Run checks"
      status="error"
      defaultOpen
      detailLabel="Details"
    >
      Failed
    </TraceStep>,
  );
  expect(
    screen
      .getByRole("button", { name: "Details" })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  view.rerender(
    <TraceStep
      label="Run checks"
      status="error"
      defaultOpen
      detailLabel="Details"
    >
      More details
    </TraceStep>,
  );
  expect(
    screen
      .getByRole("button", { name: "Details" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
});
