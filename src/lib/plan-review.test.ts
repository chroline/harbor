import { expect, it } from "vitest";
import { planRequests, reviewText } from "../../tests/providers/plan-reviews";
import { planReview, planReviewEntries } from "./plan-review";
import type { TimelineEntry } from "./protocol";
const message = (
  text: string,
  role: "assistant" | "user" = "assistant",
  childId?: string,
): TimelineEntry => ({
  type: "message",
  sequence: 1,
  message: {
    id: text,
    sequence: 1,
    streamId: "1",
    timestamp: 1,
    role,
    text,
    childId,
  },
});
it("preserves exact provider choices and keeps elevated choices secondary", () => {
  for (const request of Object.values(planRequests))
    expect(planReview(request)?.text).toBe(reviewText);
  expect(planReview(planRequests.claude)?.extra.map((o) => o.id)).toEqual([
    "exit-plan-clear-auto",
    "exit-plan-auto",
    "exit-plan-bypass",
  ]);
  expect(planReview(planRequests.grok)?.extra.map((o) => o.id)).toEqual([
    "abandoned",
  ]);
});
it("does not reinterpret unrelated mode or permission approvals", () => {
  expect(
    planReview({
      ...planRequests.codex,
      params: {
        ...planRequests.codex.params,
        options: [{ optionId: "yes", kind: "allow_always", name: "Approve" }],
      },
    }),
  ).toBeUndefined();
});
it("deduplicates only exact plan prose in the current turn and ownership", () => {
  const old = message(reviewText),
    user = message("plan please", "user"),
    plan = message(reviewText),
    other = message("Additional explanation"),
    worker = message(reviewText, "assistant", "worker");
  const interaction = {
    ...planRequests.codex,
    sequence: 4,
    timestamp: 4,
    status: "pending" as const,
    prompt: {
      id: user.type === "message" ? user.message.id : "",
      text: "plan please",
      occurrence: 1,
    },
  };
  const result = planReviewEntries(
    [old, user, plan, other, worker],
    [interaction],
  );
  expect(
    result.filter(
      (entry) => !(entry.type === "message" && entry.message.planReview),
    ),
  ).toEqual([old, user, other, worker]);
  expect(
    result.filter(
      (entry) => entry.type === "message" && entry.message.planReview,
    ),
  ).toHaveLength(1);
  expect(planReviewEntries([user, plan], [])).toEqual([user, plan]);
});

// Approval is a transcript event, not the lifetime of the plan's presentation.
it.each(["codex", "claude", "grok"])(
  "keeps %s's card after approval and restart, with later text separate",
  async (provider) => {
    const { emptyTranscript, reduceEvent, timeline } =
      await import("./protocol");
    const events = [
      { kind: "user_message", payload: { text: "Write a plan" } },
      {
        kind: "session/update",
        payload: {
          sessionId: "wire-root",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: reviewText },
          },
        },
      },
      { kind: "request", payload: planRequests[provider] },
      {
        kind: "answered",
        payload: {
          id: 0,
          result: {
            outcome: {
              outcome: "selected",
              optionId: planReview(planRequests[provider])!.implement.id,
            },
          },
        },
      },
      {
        kind: "session/update",
        payload: {
          sessionId: "wire-root",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "Now implementing the approved plan.",
            },
          },
        },
      },
    ].map((e, index) => ({
      ...e,
      sequence: index + 1,
      sessionId: "chat",
      timestamp: index + 1,
    }));
    const replay = () =>
      events.reduce((t, e) => reduceEvent(t, e as any), emptyTranscript());
    for (const transcript of [replay(), replay()]) {
      const entries = planReviewEntries(
        timeline(transcript),
        transcript.interactions ?? [],
      );
      const cards = entries.filter(
        (e) => e.type === "message" && e.message.planReview,
      );
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({
        message: { text: reviewText, planReview: { status: "answered" } },
      });
      expect(
        entries.filter(
          (e) =>
            e.type === "message" &&
            !e.message.planReview &&
            e.message.text === reviewText,
        ),
      ).toEqual([]);
      expect(entries.at(-1)).toMatchObject({
        message: { text: "Now implementing the approved plan." },
      });
    }
  },
);

it("reattaches approved plans to the right replayed user turn without losing subsequent text", async () => {
  const { emptyTranscript, reduceEvent, timeline } = await import("./protocol");
  const raw = [
    ["user_message", { text: "Plan please" }],
    ["request", planRequests.claude],
    [
      "answered",
      {
        id: 0,
        result: {
          outcome: { outcome: "selected", optionId: "exit-plan-default" },
        },
      },
    ],
    ["disconnected", {}],
    ["history_reset", {}],
    [
      "session/update",
      {
        sessionId: "new-wire",
        update: {
          sessionUpdate: "user_message_chunk",
          content: { type: "text", text: "Plan please" },
        },
      },
    ],
    [
      "session/update",
      {
        sessionId: "new-wire",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: reviewText + "\n\nImplementation finished.",
          },
        },
      },
    ],
    ["user_message", { text: "Next request" }],
  ];
  const transcript = raw.reduce(
    (t, [kind, payload], i) =>
      reduceEvent(t, {
        sequence: i + 1,
        timestamp: i + 1,
        sessionId: "chat",
        kind: kind as string,
        payload: payload as any,
      }),
    emptyTranscript(),
  );
  const entries = planReviewEntries(
    timeline(transcript),
    transcript.interactions,
  );
  expect(
    entries.map((e) =>
      e.type === "message"
        ? e.message.planReview
          ? "plan-card"
          : e.message.text
        : "tool",
    ),
  ).toEqual([
    "Plan please",
    "plan-card",
    "Implementation finished.",
    "Next request",
  ]);
  expect(entries[1]).toMatchObject({
    message: { planReview: { status: "answered" } },
  });
});

it("keeps reused request IDs and identical plans in their own turns", async () => {
  const { emptyTranscript, reduceEvent, timeline } = await import("./protocol");
  const raw = [
    ["user_message", { text: "Plan please" }],
    ["request", planRequests.grok],
    ["answered", { id: 0 }],
    ["user_message", { text: "Plan please" }],
    ["request", planRequests.grok],
  ];
  const transcript = raw.reduce(
    (t, [kind, payload], i) =>
      reduceEvent(t, {
        sequence: i + 1,
        timestamp: i + 1,
        sessionId: "chat",
        kind: kind as string,
        payload: payload as any,
      }),
    emptyTranscript(),
  );
  const cards = planReviewEntries(
    timeline(transcript),
    transcript.interactions,
  ).filter((e) => e.type === "message" && e.message.planReview);
  expect(cards).toHaveLength(2);
  expect(cards[0]).toMatchObject({
    message: { id: "plan-review:2", planReview: { status: "answered" } },
  });
  expect(cards[1]).toMatchObject({
    message: { id: "plan-review:5", planReview: { status: "pending" } },
  });
});

it("preserves interrupted/cancelled plans and separates root and worker ownership", async () => {
  const { emptyTranscript, reduceEvent, timeline } = await import("./protocol");
  const request = {
    ...planRequests.codex,
    id: "worker:0",
    params: {
      ...planRequests.codex.params,
      _harborChildId: "worker",
      _harborRequestId: 0,
      sessionId: "worker",
    },
  };
  let t = emptyTranscript();
  const emit = (kind: string, payload: unknown) => {
    t = reduceEvent(t, {
      sequence: t.lastSequence + 1,
      timestamp: t.lastSequence + 1,
      sessionId: "chat",
      kind,
      payload: payload as any,
    });
  };
  emit("user_message", { text: "Root plan" });
  emit("request", planRequests.codex);
  emit("user_message", { text: "Worker plan", childId: "worker" });
  emit("request", request);
  emit("child_disconnected", { childId: "worker" });
  emit("disconnected", {});
  const root = planReviewEntries(timeline(t), t.interactions);
  const worker = planReviewEntries(
    timeline(t, "worker"),
    t.interactions,
    "worker",
  );
  expect(
    root.filter((e) => e.type === "message" && e.message.planReview),
  ).toHaveLength(1);
  expect(
    worker.filter((e) => e.type === "message" && e.message.planReview),
  ).toHaveLength(1);
  expect(root.at(-1)).toMatchObject({
    message: { planReview: { status: "interrupted" } },
  });
  expect(worker.at(-1)).toMatchObject({
    message: { planReview: { status: "interrupted", id: "worker:0" } },
  });
  emit("answered", {
    id: "worker:0",
    result: { outcome: { outcome: "cancelled" } },
  });
  const { planReviewStatus } = await import("./plan-review");
  expect(planReviewStatus(t.interactions.at(-1)!)).toBe(
    "Plan review cancelled",
  );
  expect(planReviewStatus(t.interactions[0])).toBe("Plan review interrupted");
});
