import { useLayoutEffect, useRef } from "react";
import { CornerUpRight, Pencil, Paperclip, X } from "lucide-react";
import type { QueueSnapshot } from "../lib/bindings/QueueSnapshot";
import { Button } from "./ui/button";
import { Message, MessageContent } from "./ui/message";
import { Bubble, BubbleContent } from "./ui/bubble";
import { RichText } from "./shared";
import "./prompt-queue.css";

export function PromptQueue({ queue, onRemove, onEdit, onSteer, editing, onResume }: {
  queue: QueueSnapshot;
  onRemove: (id: string) => void;
  onEdit?: (id: string) => void;
  onSteer?: (id: string) => void;
  editing?: boolean;
  onResume?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const list = ref.current?.querySelector<HTMLOListElement>("ol");
    if (!list) return;
    const rows = [...list.querySelectorAll<HTMLLIElement>(".prompt-queue-row")];
    const update = () => {
      const heights = rows.map(row => row.querySelector<HTMLElement>(".transcript-message")?.offsetHeight ?? 0);
      const firstBubble = rows[0]?.querySelector<HTMLElement>('[data-slot="bubble-content"]');
      const firstBody = rows[0]?.querySelector<HTMLElement>(".typeset");
      const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const firstInset = firstBubble ? parseFloat(getComputedStyle(firstBubble).paddingTop) || 0 : 0;
      const firstLine = firstBody ? (parseFloat(getComputedStyle(firstBody).getPropertyValue("--lh-body")) || 1.25) * rootSize : 0;
      // The row extends eight pixels behind the composer. Reserve only enough
      // space for its first line; the rest stays on the same card behind it.
      const front = (firstInset + firstLine) * .95 + 10;
      let collapsed = 0;
      let expanded = 0;
      rows.forEach((row, index) => {
        const scale = Math.max(.7, 1 - (index + 1) * .05);
        const bubble = row.querySelector<HTMLElement>('[data-slot="bubble-content"]');
        const body = row.querySelector<HTMLElement>(".typeset");
        if (index && bubble && body) {
          const inset = parseFloat(getComputedStyle(bubble).paddingTop) || 0;
          const line = (parseFloat(getComputedStyle(body).getPropertyValue("--lh-body")) || 1.25) * rootSize;
          collapsed += (inset + line) * scale + 2;
        }
        row.style.setProperty("--stack-y", `${collapsed + front - heights[index] * scale}px`);
        row.style.setProperty("--expanded-y", `${expanded}px`);
        row.style.setProperty("--stack-scale", String(scale));
        row.style.zIndex = String(rows.length - index);
        expanded += heights[index] + 10;
      });
      list.style.height = `${rows.length ? Math.max(0, front + collapsed - 8) : 0}px`;
      ref.current?.style.setProperty("--expanded-height", `${expanded}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    rows.forEach(row => { const message = row.querySelector<HTMLElement>(".transcript-message"); if (message) observer.observe(message); });
    return () => observer.disconnect();
  }, [queue.items]);
  if (!queue.items.length) return null;
  return <section ref={ref} className="prompt-queue prompt-queue-stack chat-transcript" aria-label="Message queue">
    <ol>{queue.items.map(item => <li key={item.id} className={`prompt-queue-row${item.editing ? " is-editing" : ""}`}>
      <Message align="end" className="transcript-message transcript-user" aria-label="Queued message">
        <MessageContent><Bubble align="end" variant="muted"><BubbleContent>
          <RichText text={item.text || "Attached files"} />
          {!!item.attachments.length && <div className="prompt-queue-attachments"><Paperclip size={12} aria-hidden="true" /> {item.attachments.join(", ")}</div>}
        </BubbleContent></Bubble></MessageContent>
      </Message>
      {item.editing ? <span className="prompt-queue-editing"><Pencil size={11} aria-hidden="true" /> Editing</span> : <div className="prompt-queue-actions">
        {onSteer && <Button variant="ghost" size="compact" disabled={editing} aria-label={`Steer with queued message: ${item.text || "Attached files"}`} onClick={() => onSteer(item.id)}><CornerUpRight size={14} /> Steer</Button>}
        {onEdit && <Button variant="ghost" size="compact" disabled={editing} aria-label={`Edit queued message: ${item.text || "Attached files"}`} onClick={() => onEdit(item.id)}><Pencil size={14} /> Edit</Button>}
        <Button variant="ghost" size="icon-compact" aria-label={`Remove queued message: ${item.text || "Attached files"}`} onClick={() => onRemove(item.id)}><X size={12} /></Button>
      </div>}
    </li>)}</ol>{onResume && queue.paused && <Button variant="ghost" size="compact" onClick={onResume}>Resume</Button>}
  </section>;
}
