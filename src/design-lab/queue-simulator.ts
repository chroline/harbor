import type { QueuedPrompt } from "../lib/bindings/QueuedPrompt";
export type QueueDemo = {
  active: string | null;
  items: QueuedPrompt[];
  paused: boolean;
  steering: boolean;
  error: string | null;
  history: string[];
};
export type DemoAction =
  | { type: "submit"; item: QueuedPrompt }
  | { type: "complete" | "cancelled" | "stop" | "resume" | "fail" }
  | { type: "remove"; id: string }
  | { type: "edit"; id: string; text: string; attachments?: string[] }
  | { type: "steer-queued"; id: string }
  | { type: "reset"; scenario: string };
const fixture = (
  id: string,
  text: string,
  attachments: string[] = [],
): QueuedPrompt => ({ id, text, attachments, intent: "send", editing: false });
export function demoScenario(scenario: string): QueueDemo {
  return {
    active:
      scenario === "paused" || scenario === "error"
        ? null
        : "Refining the project sidebar",
    items:
      scenario === "working"
        ? []
        : [
            ...(scenario === "steering"
              ? [
                  {
                    ...fixture(
                      "steer",
                      "Focus on keyboard accessibility first.",
                    ),
                    intent: "steer" as const,
                  },
                ]
              : []),
            fixture("a", "Add keyboard navigation to the project picker."),
            fixture("b", "Use these spacing notes for the compact view.", [
              "spacing-notes.md",
            ]),
            fixture("c", "Then check the narrow window layout."),
          ],
    paused: scenario === "paused" || scenario === "error",
    steering: scenario === "steering",
    error:
      scenario === "error"
        ? "The agent disconnected. Reconnect, then resume your messages."
        : null,
    history: [],
  };
}
function advance(state: QueueDemo): QueueDemo {
  if (state.paused || state.active || !state.items.length) return state;
  const [next, ...items] = state.items;
  return {
    ...state,
    active: next.text || next.attachments.join(", "),
    items,
    history: [...state.history, next.text || "Attached files"],
  };
}
export function queueDemoReducer(
  state: QueueDemo,
  action: DemoAction,
): QueueDemo {
  switch (action.type) {
    case "reset":
      return demoScenario(action.scenario);
    case "submit": {
      const steering =
        state.steering || (action.item.intent === "steer" && !!state.active);
      return advance({
        ...state,
        paused: false,
        error: null,
        steering,
        items:
          action.item.intent === "steer"
            ? [action.item, ...state.items]
            : [...state.items, action.item],
      });
    }
    case "complete":
      return advance({ ...state, active: null, steering: false });
    case "cancelled":
      return state.steering
        ? advance({ ...state, active: null, steering: false })
        : state;
    case "stop":
      return { ...state, active: null, paused: true, steering: false };
    case "resume":
      return advance({ ...state, paused: false, error: null });
    case "fail":
      return {
        ...state,
        active: null,
        paused: true,
        steering: false,
        error: "The agent disconnected. Reconnect, then resume your messages.",
      };
    case "remove":
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.id),
      };
    case "edit":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, text: action.text, attachments: action.attachments ?? item.attachments } : item,
        ),
      };
    case "steer-queued": {
      const item = state.items.find((queued) => queued.id === action.id);
      if (!item) return state;
      return queueDemoReducer(
        { ...state, items: state.items.filter((queued) => queued.id !== action.id) },
        { type: "submit", item: { ...item, intent: "steer" } },
      );
    }
  }
}
