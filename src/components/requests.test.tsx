// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MotionConfig } from "framer-motion";
import { RequestCard } from "./Chat";

const { call, setError } = vi.hoisted(() => ({
  call: vi.fn(),
  setError: vi.fn(),
}));
vi.mock("../lib/api", () => ({ call, json: (value: unknown) => value }));
vi.mock("../lib/store", () => ({ useStore: () => ({ setError }) }));
vi.mock("./NativeTerminal", () => ({ NativeTerminal: () => null }));
vi.mock("./Review", () => ({ Review: () => null }));
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes("reduced-motion"),
    media: query,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }));
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ACP interactions", () => {
  it("responds to the exact child permission request using the provider option ID", async () => {
    render(
      <MotionConfig reducedMotion="always">
        <RequestCard
          sessionId="host-chat"
          childName="Lighthouse"
          request={{
            id: 73,
            method: "session/request_permission",
            params: {
              sessionId: "worker-2",
              toolCall: { title: "Run tests" },
              options: [
                { optionId: "allow-73", kind: "allow_once", name: "Run once" },
                { optionId: "deny-73", kind: "reject_once", name: "Reject" },
              ],
            },
          }}
        />
      </MotionConfig>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run once" }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith("answer_request", {
        sessionId: "host-chat",
        requestId: 73,
        result: { outcome: { outcome: "selected", optionId: "allow-73" } },
      }),
    );
    expect(screen.getByText("Lighthouse")).toBeTruthy();
  });

  const request = {
    id: "worker:question-7",
    method: "elicitation/create",
    params: {
      _harborChildId: "worker",
      _harborRequestId: 0,
      mode: "form",
      message: "Choose the implementation",
      requestedSchema: {
        type: "object",
        required: ["scope"],
        properties: {
          scope: {
            type: "string",
            title: "Scope",
            oneOf: [
              { const: "backend", title: "Backend" },
              { const: "frontend", title: "Frontend" },
            ],
          },
          checks: {
            type: "array",
            title: "Checks",
            items: {
              anyOf: [
                { const: "unit", title: "Unit" },
                { const: "browser", title: "Browser" },
              ],
            },
          },
          custom: { type: "string", title: "Other" },
          approve: { type: "boolean", title: "Approve" },
          count: { type: "integer", title: "Count", minimum: 1 },
        },
      },
    },
  };
  it("submits typed form answers and exact child/request IDs", async () => {
    render(<RequestCard sessionId="host" request={request} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Scope *" }), {
      target: { value: "backend" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Unit" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Browser" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Other" }), {
      target: { value: "Keep compatibility" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Approve" }), {
      target: { value: "false" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Count" }), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith("answer_request", {
        sessionId: "host",
        requestId: { childId: "worker", requestId: 0 },
        result: {
          action: "accept",
          content: {
            scope: "backend",
            checks: ["unit", "browser"],
            custom: "Keep compatibility",
            approve: false,
            count: 2,
          },
        },
      }),
    );
  });
  it.each(["Decline", "Cancel"])(
    "supports %s without inventing answers",
    async (action) => {
      render(<RequestCard sessionId="host" request={request} />);
      fireEvent.click(screen.getByRole("button", { name: action }));
      await waitFor(() =>
        expect(call).toHaveBeenCalledWith(
          "answer_request",
          expect.objectContaining({ result: { action: action.toLowerCase() } }),
        ),
      );
    },
  );
  it("allows retry after a failed response", async () => {
    call.mockRejectedValueOnce(new Error("Transport unavailable"));
    render(<RequestCard sessionId="host" request={request} />);
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() =>
      expect(setError).toHaveBeenCalledWith("Error: Transport unavailable"),
    );
    call.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
  });
  it("does not submit missing required answers or unsupported schemas", () => {
    const view = render(<RequestCard sessionId="host" request={request} />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Submit answers" }).closest("form")!,
    );
    expect(screen.getByRole("alert").textContent).toContain("Answer Scope");
    expect(call).not.toHaveBeenCalled();
    view.rerender(
      <RequestCard
        sessionId="host"
        request={{
          ...request,
          params: {
            ...request.params,
            requestedSchema: {
              type: "object",
              properties: { nested: { type: "object" } },
            },
          },
        }}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Submit answers" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
