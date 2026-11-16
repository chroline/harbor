import type { TimelineEntry } from "@/lib/protocol";
import type { ChatMinimapItem } from "./ui/chat-minimap";

/** Index the displayed conversation only, using the transcript's stable row IDs. */
export function chatMinimapItems(entries: TimelineEntry[]): ChatMinimapItem[] {
  const items: ChatMinimapItem[] = [];
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const { message } = entry;
    if (message.role === "user") {
      items.push({
        id: `message:${message.id}`,
        title:
          message.text.replace(/\s+/g, " ").trim().slice(0, 180) ||
          `Message ${items.length + 1}`,
        description: "",
      });
    } else if (message.role === "assistant" && items.length) {
      // The turn's last agent message is its outcome; earlier ones are usually
      // progress narration ("Let me look at…").
      const text = message.text.replace(/\s+/g, " ").trim().slice(0, 360);
      if (text) items[items.length - 1].description = text;
    }
  }
  return items;
}
