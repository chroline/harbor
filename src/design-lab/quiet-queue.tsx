import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUp,
  ChevronDown,
  Square,
  Sun,
  Moon,
  RotateCcw,
  CornerDownLeft,
  Check,
  Anchor,
  Paperclip,
  Pencil,
  CornerUpRight,
  X,
} from "lucide-react";
import { TaskComposer } from "../components/TaskComposer";
import { Message, MessageContent } from "../components/ui/message";
import { Bubble, BubbleContent } from "../components/ui/bubble";
import { MessageAttachments } from "../components/MessageAttachments";
import { RichText } from "../components/shared";
import { Button } from "../components/ui/button";
import "../components/chat-transcript.css";
import { demoScenario, queueDemoReducer } from "./queue-simulator";
import "../styles.css";
import "./queuing.css";
import "./quiet-queue.css";

const variants = [
  {
    name: "Fine outlines",
    note: "Outlined message bubbles peek out in a shallow, even stack.",
    kind: "outline",
    tag: "DELICATE BOUNDARIES",
  },
  {
    name: "Shared surface",
    note: "A wider, tightly layered stack makes each message feel part of the composer.",
    kind: "surface",
    tag: "A SINGLE GROUP",
  },
  {
    name: "Soft fill",
    note: "Softly filled message bubbles overlap with a relaxed rhythm.",
    kind: "fill",
    tag: "SOFT AND SPACIOUS",
  },
  {
    name: "Hairline list",
    note: "Slim bubbles sit close together and keep the messages understated.",
    kind: "hairline",
    tag: "LIGHTEST CHROME",
  },
  {
    name: "Leading edge",
    note: "A soft leading edge adds structure to the layered message bubbles.",
    kind: "edge",
    tag: "SUBTLE STRUCTURE",
  },
  {
    name: "Rounded layers",
    note: "Rounder, raised bubbles give the stack a deeper sense of dimension.",
    kind: "layers",
    tag: "SOFTLY LAYERED",
  },
];
type PreviewAttachment = { name: string; mimeType: string; size: number };
function UserMessage({
  text,
  files = [],
  compactAttachments = false,
}: {
  text: string;
  files?: PreviewAttachment[];
  compactAttachments?: boolean;
}) {
  return (
    <Message
      align="end"
      className="transcript-message transcript-user"
      aria-label="Your message"
    >
      <MessageContent>
        <Bubble align="end" variant="muted">
          <BubbleContent title={text}>
            {files.length > 0 && !compactAttachments && <MessageAttachments files={files} />}
            <RichText text={text} />
            {files.length > 0 && compactAttachments && (
              <div className="ql-attachment-names">
                <Paperclip size={12} aria-hidden="true" />
                <span>{files.map((file) => file.name).join(", ")}</span>
              </div>
            )}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}
function Miniature({ kind }: { kind: string }) {
  return (
    <div className={`ql-mini ql-mini-${kind}`} aria-hidden="true">
      <div className="ql-mini-conversation">
        <i />
        <i />
        <i />
      </div>
      <div className="ql-mini-queue">
        <b />
        <b />
        <b />
      </div>
      <div className="ql-mini-composer">
        <i />
        <span>
          ＋ <em>Codex</em>
          <ArrowUp size={10} />
        </span>
      </div>
    </div>
  );
}
function Lab() {
  const [variant, setVariant] = useState(() =>
    Math.max(
      0,
      variants.findIndex((v) => `#${v.kind}` === location.hash),
    ),
  );
  const [theme, setTheme] = useState("dark");
  const [narrow, setNarrow] = useState(false);
  const [scenario, setScenario] = useState("queued");
  const [state, dispatch] = useReducer(
    queueDemoReducer,
    "queued",
    demoScenario,
  );
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState<{ id: string; previousDraft: string; previousFiles: File[] } | null>(null);
  const attachmentFiles = useRef<Record<string, File>>({});
  const queueRef = useRef<HTMLDivElement>(null);
  const attachmentInfo = useRef<Record<string, PreviewAttachment>>({
    "spacing-notes.md": {
      name: "spacing-notes.md",
      mimeType: "text/markdown",
      size: 1536,
    },
  });
  useLayoutEffect(() => {
    const list =
      queueRef.current?.querySelector<HTMLOListElement>(".prompt-queue ol");
    if (!list) return;
    const rows = Array.from(
      list.querySelectorAll<HTMLLIElement>(".prompt-queue-row"),
    );
    const update = () => {
      let offset = 0;
      const messages = rows.map((row) =>
        row.querySelector<HTMLElement>(".transcript-message"),
      );
      const heights = messages.map((message) => message?.offsetHeight ?? 0);
      const frontHeight = heights[0] ?? 0;
      const frontScaledHeight = frontHeight * 0.95;
      let collapsedOffset = 0;
      rows.forEach((row, index) => {
        const height = heights[index];
        const scale = Math.max(0.7, 1 - (index + 1) * 0.05);
        const bubble = row.querySelector<HTMLElement>('[data-slot="bubble-content"]');
        const body = row.querySelector<HTMLElement>(".typeset");
        if (index > 0 && bubble && body) {
          const padding = parseFloat(getComputedStyle(bubble).paddingTop) || 0;
          const lineHeight = parseFloat(getComputedStyle(body).getPropertyValue("--lh-body"))
            * parseFloat(getComputedStyle(document.documentElement).fontSize) || 20;
          collapsedOffset += (padding + lineHeight) * scale + 2;
        }
        row.style.setProperty("--natural-height", `${height}px`);
        // Expose one text line at each card's actual scale; the next card
        // covers everything below it, regardless of the message's height.
        row.style.setProperty("--stack-y", `${collapsedOffset + frontScaledHeight - height * scale}px`);
        row.style.setProperty("--expanded-y", `${offset}px`);
        row.style.setProperty("--stack-scale", String(scale));
        row.style.zIndex = String(rows.length - index);
        offset += height + 10;
      });
      list.style.setProperty(
        "--peek-height",
        `${rows.length ? Math.max(0, frontScaledHeight + collapsedOffset - 8) : 0}px`,
      );
      queueRef.current?.style.setProperty("--expanded-height", `${offset}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    rows.forEach((row) => {
      const message = row.querySelector<HTMLElement>(".transcript-message");
      if (message) observer.observe(message);
    });
    return () => observer.disconnect();
  }, [state.items]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);
  useEffect(() => {
    if (!state.steering) return;
    const timer = setTimeout(() => dispatch({ type: "cancelled" }), 650);
    return () => clearTimeout(timer);
  }, [state.steering]);
  const current = variants[variant];
  const select = (index: number) => {
    setVariant(index);
    history.replaceState(null, "", `#${variants[index].kind}`);
  };
  const reset = (value = scenario) => {
    setScenario(value);
    dispatch({ type: "reset", scenario: value });
    setDraft("");
    setFiles([]);
    setEditing(null);
  };
  const submit = (intent: "send" | "steer" = "send") => {
    if (!draft.trim() && !files.length) return;
    files.forEach((file) => {
      attachmentFiles.current[file.name] = file;
      attachmentInfo.current[file.name] = {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      };
    });
    if (editing) {
      dispatch({ type: "edit", id: editing.id, text: draft.trim(), attachments: files.map((file) => file.name) });
      if (intent === "steer") dispatch({ type: "steer-queued", id: editing.id });
      setDraft(editing.previousDraft);
      setFiles(editing.previousFiles);
      setEditing(null);
      return;
    }
    dispatch({
      type: "submit",
      item: {
        id: crypto.randomUUID(),
        text: draft.trim(),
        attachments: files.map((f) => f.name),
        intent,
        editing: false,
      },
    });
    setDraft("");
    setFiles([]);
  };
  const remove = (id: string) => dispatch({ type: "remove", id });
  const beginEdit = (item: (typeof state.items)[number]) => {
    setEditing({ id: item.id, previousDraft: editing?.previousDraft ?? draft, previousFiles: editing?.previousFiles ?? files });
    setDraft(item.text);
    setFiles(item.attachments.map((name) => {
      const info = attachmentInfo.current[name];
      return attachmentFiles.current[name] ?? new File([new Uint8Array(info?.size ?? 0)], name, { type: info?.mimeType ?? "application/octet-stream" });
    }));
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.ql-compose-area [role="textbox"]')?.focus());
  };
  const cancelEdit = () => {
    if (!editing) return;
    setDraft(editing.previousDraft);
    setFiles(editing.previousFiles);
    setEditing(null);
  };
  const queue = (
    <div
      ref={queueRef}
      className={`ql-queue quiet-study quiet-study-${current.kind} chat-transcript`}
    >
      <section className="prompt-queue" aria-label="Message queue">
        <div className="prompt-queue-heading">
          <span role="status">
            {state.steering
              ? "Stopping to steer…"
              : state.paused
                ? "Queue paused"
                : `${state.items.length} queued`}
          </span>
        </div>
        <ol>
          {state.items.map((item) => (
            <li key={item.id} className={`prompt-queue-row${editing?.id === item.id ? " is-editing" : ""}`}>
              <UserMessage
                text={item.text}
                compactAttachments
                files={item.attachments.map(
                  (name) =>
                    attachmentInfo.current[name] ?? {
                      name,
                      mimeType: "application/octet-stream",
                      size: 0,
                    },
                )}
              />
              {editing?.id === item.id ? (
                <span className="ql-editing-indicator"><Pencil size={11} aria-hidden="true" /> Editing</span>
              ) : <div className="ql-message-actions">
              <Button variant="ghost" size="compact" aria-label={`Steer with queued message: ${item.text || "Attached files"}`} onClick={() => dispatch({ type: "steer-queued", id: item.id })}><CornerUpRight size={14} /> Steer</Button>
              <Button variant="ghost" size="compact" aria-label={`Edit queued message: ${item.text || "Attached files"}`} onClick={() => beginEdit(item)}><Pencil size={14} /> Edit</Button>
              <Button
                variant="ghost"
                size="icon-compact"
                className="ql-remove-message"
                aria-label={`Remove queued message: ${item.text || "Attached files"}`}
                onClick={() => remove(item.id)}
              >
                <X size={12} />
              </Button>
              </div>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
  return (
    <main className="ql-shell quiet-lab">
      <header className="ql-header">
        <a href="/labs/quiet-queue.html" className="ql-brand">
          <Anchor size={18} /> Harbor <span>/ Design lab</span>
        </a>
        <span className="ql-local">
          <i /> Local simulation
        </span>
      </header>
      <section className="ql-intro">
        <div>
          <span className="ql-eyebrow">STACKED ROWS · QUIETER STUDIES</span>
          <h1>
            Less chrome.
            <br />
            <span>More room for the message.</span>
          </h1>
          <p>
            Queued messages peek out from behind the composer.
            <br className="ql-desktop-break" /> Hover to expand the full-width
            messages. The behavior stays the same.
          </p>
        </div>
        <div className="ql-key-guide">
          <span>
            <kbd>↵</kbd> Queue the next message
          </span>
          <span>
            <kbd>⌘ ↵</kbd> Stop this turn & steer
          </span>
          <span>
            <Square size={11} /> Stop pauses the queue
          </span>
        </div>
      </section>
      <section className="ql-gallery" aria-label="Design variations">
        {variants.map((v, index) => (
          <button
            key={v.kind}
            aria-pressed={variant === index}
            className={`ql-choice ${variant === index ? "is-selected" : ""}`}
            onClick={() => select(index)}
          >
            <Miniature kind={v.kind} />
            <span className="ql-choice-title">
              <span>
                <strong>{v.name}</strong>
              </span>
              {variant === index && <Check size={13} />}
            </span>
          </button>
        ))}
      </section>
      <section className="ql-preview-section" aria-label="Interactive preview">
        <div className="ql-preview-top">
          <div>
            <span className="ql-eyebrow">{current.tag}</span>
            <h2>{current.name}</h2>
            <p>{current.note}</p>
          </div>
          <div className="ql-display-controls">
            <div className="ql-segment" aria-label="Preview width">
              <button aria-pressed={!narrow} onClick={() => setNarrow(false)}>
                Wide
              </button>
              <button aria-pressed={narrow} onClick={() => setNarrow(true)}>
                Narrow
              </button>
            </div>
            <button
              className="ql-theme"
              aria-label={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
        <div className="ql-stage">
          <div
            className={`ql-window ${narrow ? "is-narrow" : ""} ql-window-${current.kind}`}
          >
            <div className="ql-window-bar">
              <span className="ql-window-dots">
                <i />
                <i />
                <i />
              </span>
              <span>Refine project navigation</span>
              <span className="ql-window-agent">Codex</span>
            </div>
            <div className="ql-conversation-layout">
              <div className="ql-main-pane">
                <div className="ql-transcript">
                  <div className="chat-transcript">
                    <UserMessage text="Make the sidebar feel lighter and easier to navigate." />
                  </div>
                  <div className="ql-agent">
                    <span className="ql-agent-mark">H</span>
                    <div>
                      <strong>Harbor</strong>
                      <p>
                        I’ll simplify the project groups and make the active
                        conversation easier to find.
                      </p>
                      <div className="ql-tool">
                        <Check size={12} /> Read sidebar.tsx{" "}
                        <span>+2 files</span>
                      </div>
                    </div>
                  </div>
                  {state.history.slice(-2).map((text, index) => (
                    <div
                      className="chat-transcript ql-sent"
                      key={`${index}-${text}`}
                    >
                      <UserMessage text={text} />
                    </div>
                  ))}
                  <div
                    className={`ql-activity ${state.active ? "is-working" : ""}`}
                    role="status"
                  >
                    <i />
                    {state.steering
                      ? "Ending the current turn…"
                      : (state.active ??
                        (state.paused
                          ? "Response stopped"
                          : "Ready for your next instruction"))}
                  </div>
                </div>
                <div className="ql-compose-area">
                  <div className="ql-composer-stack">
                    {queue}
                    <TaskComposer
                      value={draft}
                      onValueChange={setDraft}
                      files={files}
                      onFilesChange={setFiles}
                      onSubmit={submit}
                      actionLabel={
                        editing ? "Save changes" : state.active ? "Queue message" : "Send message"
                      }
                      actionDisabled={!draft.trim() && !files.length}
                      onStop={
                        state.active
                          ? () => dispatch({ type: "stop" })
                          : undefined
                      }
                      placeholder="Queue a thought, or ⌘Enter to change course…"
                      modelMenu={
                        <span className="ql-model">
                          Codex <ChevronDown size={11} /> <span>Agent</span>
                        </span>
                      }
                    />
                  </div>
                  {editing && <div className="ql-edit-banner">Editing queued message <button onClick={cancelEdit}>Cancel</button></div>}
                  {(state.paused || state.error) && (
                    <div className="ql-queue-actions">
                      {state.error && <span role="alert">{state.error}</span>}
                      {state.paused && state.items.length > 0 && (
                        <button onClick={() => dispatch({ type: "resume" })}>
                          Resume
                        </button>
                      )}
                    </div>
                  )}
                  <div className="ql-composer-caption">
                    <span>
                      <CornerDownLeft size={10} /> Queue now. Send when this
                      turn finishes.
                    </span>
                    <span>⌘↵ steer</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="ql-scenario-bar">
          <label>
            Scenario{" "}
            <select
              aria-label="Scenario"
              value={scenario}
              onChange={(e) => reset(e.target.value)}
            >
              <option value="working">Working · empty queue</option>
              <option value="queued">Several messages queued</option>
              <option value="steering">Steering</option>
              <option value="paused">Paused</option>
              <option value="error">Error</option>
            </select>
          </label>
          <div>
            <button
              disabled={!state.active}
              onClick={() => dispatch({ type: "complete" })}
            >
              <Check size={13} />
              Complete turn
            </button>
            <button onClick={() => dispatch({ type: "fail" })}>
              Simulate error
            </button>
            <button aria-label="Reset scenario" onClick={() => reset()}>
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
      </section>
      <footer className="ql-footer">
        <span>All six studies share the same queue behavior.</span>
        <span>
          Messages stay local. No agent requests are sent.{" "}
          <a href="/labs/stacked-queuing.html">Previous studies ↗</a>
        </span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Lab />);
