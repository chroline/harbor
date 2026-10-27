import { planRequests } from "../../tests/providers/plan-reviews";
import { questionRequests } from "../../tests/providers/questions";
// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
  it.each(["codex", "claude", "grok"])(
    "uses the same review and safe primary action for %s",
    async (provider) => {
      render(<RequestCard sessionId="chat" request={planRequests[provider]} />);
      fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
      expect(
        await screen.findByRole("dialog", { name: "Review plan" }),
      ).toBeTruthy();
      expect(
        screen.getByRole("heading", { name: "Update the greeting" }),
      ).toBeTruthy();
      expect(screen.queryByText("Your permission is needed")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Implement plan" }));
      const id = {
        codex: "implement_plan",
        claude: "exit-plan-default",
        grok: "approved",
      }[provider];
      await waitFor(() =>
        expect(call).toHaveBeenCalledWith("answer_request", {
          sessionId: "chat",
          requestId: 0,
          result: { outcome: { outcome: "selected", optionId: id } },
        }),
      );
    },
  );
  it.each(["codex", "claude", "grok"])(
    "approves %s from the preview card using its original safe option",
    async (provider) => {
      render(<RequestCard sessionId="chat" request={planRequests[provider]} />);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByText("To-dos")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Implement plan" }));
      await waitFor(() =>
        expect(call).toHaveBeenCalledWith("answer_request", {
          sessionId: "chat",
          requestId: 0,
          result: {
            outcome: {
              outcome: "selected",
              optionId: {
                codex: "implement_plan",
                claude: "exit-plan-default",
                grok: "approved",
              }[provider],
            },
          },
        }),
      );
    },
  );
  it("shows inline response failures and allows retry without opening the sheet", async () => {
    call.mockRejectedValueOnce(new Error("Connection lost"));
    render(<RequestCard sessionId="chat" request={planRequests.codex} />);
    fireEvent.click(screen.getByRole("button", { name: "Implement plan" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Connection lost",
    );
    fireEvent.click(screen.getByRole("button", { name: "Implement plan" }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
  });
  it("closes and reopens without answering a pending plan", async () => {
    render(<RequestCard sessionId="chat" request={planRequests.claude} />);
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(call).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    await screen.findByRole("dialog");
    expect(
      screen.getByRole("heading", { name: "Update the greeting" }),
    ).toBeTruthy();
  });
  it("retains review and controls after a failed answer", async () => {
    call.mockRejectedValueOnce(new Error("Connection lost"));
    render(<RequestCard sessionId="chat" request={planRequests.claude} />);
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Implement plan" }));
    await waitFor(() =>
      expect(setError).toHaveBeenCalledWith("Error: Connection lost"),
    );
    expect(screen.getByRole("alert").textContent).toContain("Connection lost");
    expect(
      (
        screen.getByRole("button", {
          name: "Keep planning",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(
      screen.getByRole("heading", { name: "Update the greeting" }),
    ).toBeTruthy();
  });
  it("shows the actual plan before sending Grok's original approval choice", async () => {
    render(
      <RequestCard
        sessionId="grok-chat"
        request={{
          id: 7,
          method: "session/request_permission",
          params: {
            sessionId: "grok-wire",
            toolCall: {
              title: "Approve Grok plan",
              kind: "switch_mode",
              content: [
                {
                  type: "content",
                  content: {
                    type: "text",
                    text: "Change greeting.txt from hello to ahoy.",
                  },
                },
              ],
            },
            options: [
              {
                optionId: "approved",
                kind: "allow_once",
                name: "Approve and implement",
              },
              {
                optionId: "cancelled",
                kind: "reject_once",
                name: "Keep planning",
              },
            ],
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    await screen.findByRole("dialog");
    expect(
      within(screen.getByRole("dialog")).getByText(
        "Change greeting.txt from hello to ahoy.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep planning" }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith("answer_request", {
        sessionId: "grok-chat",
        requestId: 7,
        result: { outcome: { outcome: "selected", optionId: "cancelled" } },
      }),
    );
  });
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
    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Unit" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Browser" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Other" }), {
      target: { value: "Keep compatibility" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Count" }), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
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
  it.each(["Skip", "Cancel"])(
    "supports %s without inventing answers",
    async (action) => {
      render(<RequestCard sessionId="host" request={request} />);
      fireEvent.click(screen.getByRole("button", { name: action }));
      await waitFor(() =>
        expect(call).toHaveBeenCalledWith(
          "answer_request",
          expect.objectContaining({ result: { action: action === "Skip" ? "decline" : "cancel" } }),
        ),
      );
    },
  );
  it("allows retry after a failed response", async () => {
    call.mockRejectedValueOnce(new Error("Transport unavailable"));
    render(<RequestCard sessionId="host" request={request} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() =>
      expect(setError).toHaveBeenCalledWith("Error: Transport unavailable"),
    );
    call.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
  });
  it("retains the choice and note when submitting fails, and retries the same answer", async () => {
    call.mockRejectedValueOnce(new Error("Transport unavailable"));
    render(<RequestCard sessionId="host" request={questionRequests.codex} />);
    fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Something else/ }), { target: { value: "Navy" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Blue" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByRole("textbox", { name: /Something else/ }) as HTMLTextAreaElement).value).toBe("Navy");
    call.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    expect(call.mock.calls[0]).toEqual(call.mock.calls[1]);
  });
  it("starts a fresh draft when a provider reuses a request ID for a different question", () => {
    const view = render(<RequestCard sessionId="host" request={questionRequests.claude} />);
    fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Something else/ }), { target: { value: "Navy" } });
    view.rerender(<RequestCard sessionId="host" request={{ ...questionRequests.claude, params: { ...questionRequests.claude.params, toolCallId: "next-question" } }} />);
    expect(screen.getByRole("radio", { name: "Blue" }).getAttribute("aria-checked")).toBe("false");
    expect((screen.getByRole("textbox", { name: /Something else/ }) as HTMLTextAreaElement).value).toBe("");
  });
  it("does not submit missing required answers or unsupported schemas", () => {
    const view = render(<RequestCard sessionId="host" request={request} />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
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
        .getByRole("button", { name: "Continue" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});

it("keeps an answered plan viewable without allowing a second approval", async () => {
  const { PlanReview } = await import("./PlanReview");
  const { planReview } = await import("../lib/plan-review");
  render(
    <PlanReview
      review={planReview(planRequests.codex)!}
      busy={false}
      status="Approved for implementation"
    />,
  );
  expect(screen.getByText("Approved for implementation")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Implement plan" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
  await screen.findByRole("dialog");
  expect(
    screen.getByRole("heading", { name: "Update the greeting" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Keep planning" })).toBeNull();
  expect(call).not.toHaveBeenCalled();
});
