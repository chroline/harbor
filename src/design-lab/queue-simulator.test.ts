import { expect, it } from "vitest";
import { demoScenario, queueDemoReducer } from "./queue-simulator";
const message = (intent: "send" | "steer" = "send") => ({
  id: "new",
  text: "New instruction",
  attachments: ["notes.md"],
  intent,
  editing: false,
});
it("queues during a turn and dispatches exactly one message after completion", () => {
  const state = queueDemoReducer(demoScenario("working"), {
    type: "submit",
    item: message(),
  });
  expect(state.active).toBe("Refining the project sidebar");
  expect(state.items).toHaveLength(1);
  const next = queueDemoReducer(state, { type: "complete" });
  expect(next.active).toBe("New instruction");
  expect(next.items).toHaveLength(0);
});
it("steers after simulated cancellation and preserves the existing queue", () => {
  const initial = demoScenario("queued");
  const state = queueDemoReducer(initial, {
    type: "submit",
    item: message("steer"),
  });
  expect(state.active).toBe(initial.active);
  expect(state.steering).toBe(true);
  const next = queueDemoReducer(state, { type: "cancelled" });
  expect(next.active).toBe("New instruction");
  expect(next.items).toEqual(initial.items);
});
it("Stop retains queued attachments and Resume advances the oldest instruction", () => {
  const initial = demoScenario("queued");
  const stopped = queueDemoReducer(initial, { type: "stop" });
  expect(stopped.paused).toBe(true);
  expect(stopped.active).toBeNull();
  expect(stopped.items).toEqual(initial.items);
  const resumed = queueDemoReducer(stopped, { type: "resume" });
  expect(resumed.active).toBe(initial.items[0].text);
  expect(resumed.items[0].attachments).toEqual(["spacing-notes.md"]);
});
it("errors hold pending messages until explicit resumption", () => {
  const failed = queueDemoReducer(demoScenario("queued"), { type: "fail" });
  expect(failed.paused).toBe(true);
  expect(failed.items).toHaveLength(3);
  expect(queueDemoReducer(failed, { type: "complete" }).active).toBeNull();
  expect(queueDemoReducer(failed, { type: "resume" }).error).toBeNull();
});
it("removal and new submission while paused preserve FIFO", () => {
  const paused = demoScenario("paused");
  const removed = queueDemoReducer(paused, { type: "remove", id: "a" });
  const next = queueDemoReducer(removed, { type: "submit", item: message() });
  expect(next.active).toBe(removed.items[0].text);
  expect(next.items.at(-1)?.id).toBe("new");
});

it("keeps steering in progress when another ordinary message is queued", () => {
  const steering = queueDemoReducer(demoScenario("queued"), {
    type: "submit",
    item: message("steer"),
  });
  const queued = queueDemoReducer(steering, {
    type: "submit",
    item: { ...message(), id: "later" },
  });
  expect(queued.steering).toBe(true);
  const next = queueDemoReducer(queued, { type: "cancelled" });
  expect(next.active).toBe("New instruction");
  expect(next.items.at(-1)?.id).toBe("later");
});

it("edits a queued message in place without changing its attachments or order", () => {
  const initial = demoScenario("queued");
  const edited = queueDemoReducer(initial, { type: "edit", id: "b", text: "Updated" });
  expect(edited.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
  expect(edited.items[1]).toMatchObject({ text: "Updated", attachments: ["spacing-notes.md"] });
});

it("steers with a queued message and retains the other messages in order", () => {
  const initial = demoScenario("queued");
  const steering = queueDemoReducer(initial, { type: "steer-queued", id: "b" });
  expect(steering.steering).toBe(true);
  expect(steering.items.map((item) => item.id)).toEqual(["b", "a", "c"]);
  const next = queueDemoReducer(steering, { type: "cancelled" });
  expect(next.active).toBe(initial.items[1].text);
  expect(next.items.map((item) => item.id)).toEqual(["a", "c"]);
});
