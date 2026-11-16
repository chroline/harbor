import { expect, it } from "vitest";
import type { TimelineEntry } from "@/lib/protocol";
import { chatMinimapItems } from "./chat-minimap";

const message = (id: string, role: string, text: string) =>
  ({ type: "message", message: { id, role, text } }) as unknown as TimelineEntry;

it("describes each turn with its last agent message", () => {
  const items = chatMinimapItems([
    message("u1", "user", "Fix the  build"),
    message("a1", "assistant", "Let me look at the logs."),
    message("a2", "assistant", "Fixed:\n the missing import."),
    message("a3", "assistant", "   "),
    message("u2", "user", "Thanks"),
    message("a4", "assistant", "You're welcome."),
  ]);
  expect(items).toEqual([
    { id: "message:u1", title: "Fix the build", description: "Fixed: the missing import." },
    { id: "message:u2", title: "Thanks", description: "You're welcome." },
  ]);
});
