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

describe("Provider interaction routing through Fluid controls", () => {
  it("validates and navigates mixed question types before submitting all provider IDs", async () => {
    render(
      <MotionConfig reducedMotion="always">
        <RequestCard
          sessionId="host-chat"
          request={{
            id: 76,
            method: "cursor/ask_question",
            params: {
              _harborChildId: "worker-76",
              _harborRequestId: 0,
              questions: [
                {
                  id: "scope",
                  prompt: "Which scope?",
                  options: [{ id: "backend", label: "Backend" }],
                },
                {
                  id: "checks",
                  prompt: "Which checks?",
                  allowMultiple: true,
                  options: [
                    { id: "unit", label: "Unit tests" },
                    { id: "type", label: "Type check" },
                  ],
                },
              ],
            },
          }}
        />
      </MotionConfig>,
    );
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    expect(call).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen
        .getByRole("button", { name: "Submit answers" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Unit tests" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Type check" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(
      screen
        .getByRole("radio", { name: "Backend" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith("answer_request", {
        sessionId: "host-chat",
        requestId: { childId: "worker-76", requestId: 0 },
        result: {
          outcome: {
            outcome: "answered",
            answers: [
              { questionId: "scope", selectedOptionIds: ["backend"] },
              { questionId: "checks", selectedOptionIds: ["unit", "type"] },
            ],
          },
        },
      }),
    );
  });

  it("allows retry after an answer fails and preserves the request identifier", async () => {
    call
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValueOnce(undefined);
    render(
      <MotionConfig reducedMotion="always">
        <RequestCard
          sessionId="host-chat"
          request={{
            id: "request-77",
            method: "cursor/ask_question",
            params: {
              questions: [
                {
                  id: "scope",
                  prompt: "Which scope?",
                  options: [{ id: "backend", label: "Backend" }],
                },
              ],
            },
          }}
        />
      </MotionConfig>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    await waitFor(() =>
      expect(setError).toHaveBeenCalledWith("Error: Temporary failure"),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("radio", { name: "Backend" })
          .getAttribute("aria-checked"),
      ).toBe("false"),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    expect(call.mock.calls[1][1].requestId).toBe("request-77");
  });
  it("renders Pi extension choices as questions and preserves child/request/option IDs", async () => {
    render(
      <MotionConfig reducedMotion="always">
        <RequestCard
          sessionId="host-chat"
          childName="Worker"
          request={{
            id: 0,
            method: "session/request_permission",
            params: {
              sessionId: "pi-child",
              toolCall: {
                toolCallId: "pi-ui-select-123",
                title: "[Agent] Which worker?",
                rawInput: { method: "select" },
              },
              options: [
                {
                  optionId: "choice-0",
                  kind: "allow_once",
                  name: "1. Delegate — A bounded task.",
                },
                {
                  optionId: "choice-1",
                  kind: "allow_once",
                  name: "2. Type something.",
                },
              ],
            },
          }}
        />
      </MotionConfig>,
    );
    expect(screen.queryByText("Your permission is needed")).toBeNull();
    expect(screen.getByText("Which worker?")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Delegate/ }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith("answer_request", {
        sessionId: "host-chat",
        requestId: 0,
        result: { outcome: { outcome: "selected", optionId: "choice-0" } },
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

  it("preserves multiple selected option IDs without changing the reply shape", async () => {
    render(
      <MotionConfig reducedMotion="always">
        <RequestCard
          sessionId="host-chat"
          request={{
            id: 74,
            method: "cursor/ask_question",
            params: {
              questions: [
                {
                  id: "checks",
                  prompt: "Which checks?",
                  allowMultiple: true,
                  options: [
                    { id: "unit", label: "Unit tests" },
                    { id: "type", label: "Type check" },
                  ],
                },
              ],
            },
          }}
        />
      </MotionConfig>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Unit tests" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Type check" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith("answer_request", {
        sessionId: "host-chat",
        requestId: 74,
        result: {
          outcome: {
            outcome: "answered",
            answers: [
              { questionId: "checks", selectedOptionIds: ["unit", "type"] },
            ],
          },
        },
      }),
    );
  });

  it("maps the single-choice question flow back to provider identifiers", async () => {
    render(
      <MotionConfig reducedMotion="always">
        <RequestCard
          sessionId="host-chat"
          request={{
            id: 75,
            method: "cursor/ask_question",
            params: {
              questions: [
                {
                  id: "scope",
                  prompt: "Which scope?",
                  options: [
                    { id: "backend", label: "Backend" },
                    { id: "frontend", label: "Frontend" },
                  ],
                },
              ],
            },
          }}
        />
      </MotionConfig>,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Backend/ }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith("answer_request", {
        sessionId: "host-chat",
        requestId: 75,
        result: {
          outcome: {
            outcome: "answered",
            answers: [{ questionId: "scope", selectedOptionIds: ["backend"] }],
          },
        },
      }),
    );
  });
});
