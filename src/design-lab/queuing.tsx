import { useEffect, useReducer, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  ListOrdered,
  Paperclip,
  Pause,
  Play,
  Square,
  X,
  Sun,
  Moon,
  RotateCcw,
  CornerDownLeft,
  Check,
  Anchor,
} from "lucide-react";
import { TaskComposer } from "../components/TaskComposer";
import { PromptQueue } from "../components/PromptQueue";
import type { QueuedPrompt } from "../lib/bindings/QueuedPrompt";
import { demoScenario, queueDemoReducer } from "./queue-simulator";
import "../styles.css";
import "./queuing.css";

const variants = [
  {
    name: "Stacked rows",
    note: "Everything stays close to the draft.",
    kind: "stack",
    tag: "Production baseline",
  },
  {
    name: "Queue tray",
    note: "Quiet by default. Expand when you need it.",
    kind: "tray",
    tag: "Less visual weight",
  },
  {
    name: "Timeline entries",
    note: "Upcoming work lives in the conversation.",
    kind: "timeline",
    tag: "Conversation first",
  },
  {
    name: "Split action bar",
    note: "Two explicit actions, no shortcut to remember.",
    kind: "split",
    tag: "Most discoverable",
  },
  {
    name: "Side rail",
    note: "The current task and next steps, side by side.",
    kind: "rail",
    tag: "Built for longer queues",
  },
  {
    name: "Next-message card",
    note: "Give the next instruction a little more focus.",
    kind: "card",
    tag: "Clear next step",
  },
];
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
  const [expanded, setExpanded] = useState(true);
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
  };
  const submit = (intent: "send" | "steer" = "send") => {
    if (!draft.trim() && !files.length) return;
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
  const row = (item: QueuedPrompt, index: number) => (
    <li className="ql-queue-row" key={item.id}>
      <span className="ql-number">{String(index + 1).padStart(2, "0")}</span>
      <div>
        <p>{item.text || "Attached files"}</p>
        {item.attachments.length > 0 && (
          <small>
            <Paperclip size={12} />
            {item.attachments.join(", ")}
          </small>
        )}
      </div>
      <button
        className="ql-icon-button"
        aria-label={`Remove queued message: ${item.text || "Attached files"}`}
        onClick={() => remove(item.id)}
      >
        <X size={13} />
      </button>
    </li>
  );
  const status = state.steering
    ? "Stopping to steer…"
    : state.paused
      ? "Queue paused"
      : `${state.items.length} queued`;
  const heading = (
    <div className="ql-queue-heading">
      <span>
        <ListOrdered size={13} />
        {status}
      </span>
      {state.paused && (
        <button onClick={() => dispatch({ type: "resume" })}>
          <Play size={11} /> Resume
        </button>
      )}
    </div>
  );
  const queue = (
    <div className={`ql-queue ql-queue-${current.kind}`}>
      {current.kind === "stack" ? (
        <PromptQueue
          queue={{
            sessionId: "lab",
            childId: null,
            revision: 0,
            items: state.items,
            paused: state.paused,
            error: state.error,
            steering: state.steering,
          }}
          onRemove={remove}
          onResume={() => dispatch({ type: "resume" })}
        />
      ) : (
        <>
          {current.kind === "tray" ? (
            <button
              className="ql-tray-trigger"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              <span>
                <ListOrdered size={14} />
                {status}
              </span>
              <ChevronDown
                size={14}
                style={{ transform: expanded ? "rotate(180deg)" : undefined }}
              />
            </button>
          ) : (
            heading
          )}
          {(current.kind !== "tray" || expanded) && (
            <>
              {current.kind === "card" && state.items.length > 0 ? (
                <>
                  <div className="ql-next-label">UP NEXT</div>
                  <ol>{row(state.items[0], 0)}</ol>
                  {state.items.length > 1 && (
                    <ol className="ql-remaining">
                      {state.items
                        .slice(1)
                        .map((item, index) => row(item, index + 1))}
                    </ol>
                  )}
                </>
              ) : (
                <ol>{state.items.map(row)}</ol>
              )}
              {!state.items.length && (
                <p className="ql-empty">Your next message will appear here.</p>
              )}
              {current.kind === "tray" && state.paused && (
                <button
                  className="ql-resume"
                  onClick={() => dispatch({ type: "resume" })}
                >
                  <Play size={12} /> Resume queue
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
  return (
    <main className="ql-shell">
      <header className="ql-header">
        <a href="/labs/queuing.html" className="ql-brand">
          <Anchor size={18} /> Harbor <span>/ Design lab</span>
        </a>
        <span className="ql-local">
          <i /> Local simulation
        </span>
      </header>
      <section className="ql-intro">
        <div>
          <span className="ql-eyebrow">COMPOSER STUDIES · 01—06</span>
          <h1>
            Keep the thought.
            <br />
            <span>Choose when it lands.</span>
          </h1>
          <p>
            Six ways to queue the next instruction or change course mid-turn.
            <br className="ql-desktop-break" /> Same behavior. Different ways to
            stay in control.
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
                {String(index + 1).padStart(2, "0")}
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
                  <div className="ql-user">
                    Make the sidebar feel lighter and easier to navigate.
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
                    <div className="ql-user ql-sent" key={`${index}-${text}`}>
                      {text}
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
                  {current.kind === "timeline" && queue}
                </div>
                <div className="ql-compose-area">
                  {!["rail", "timeline"].includes(current.kind) && queue}
                  {state.error && current.kind !== "stack" && (
                    <div className="ql-error" role="alert">
                      {state.error}
                    </div>
                  )}
                  {current.kind === "split" ? (
                    <div className="ql-explicit-composer">
                      <textarea
                        aria-label="Message your agent"
                        value={draft}
                        placeholder="What should happen next?"
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            !e.nativeEvent.isComposing
                          ) {
                            e.preventDefault();
                            submit(e.metaKey || e.ctrlKey ? "steer" : "send");
                          }
                        }}
                      />
                      <div className="ql-split-tools">
                        <label className="ql-attach" title="Attach files">
                          <Paperclip size={15} />
                          <input
                            type="file"
                            multiple
                            aria-label="Attach files"
                            onChange={(e) =>
                              setFiles(Array.from(e.target.files ?? []))
                            }
                          />
                        </label>
                        <span>Codex · Agent</span>
                        {state.active && (
                          <button
                            aria-label="Stop response"
                            onClick={() => dispatch({ type: "stop" })}
                          >
                            <Square size={12} />
                          </button>
                        )}
                        <button
                          disabled={!draft.trim() && !files.length}
                          onClick={() => submit("send")}
                        >
                          <ListOrdered size={13} />
                          {state.active ? "Queue" : "Send"}
                        </button>
                        <button
                          className="ql-steer"
                          disabled={!draft.trim() && !files.length}
                          onClick={() => submit("steer")}
                        >
                          <ArrowUpRight size={13} />
                          Steer
                        </button>
                      </div>
                      {files.length > 0 && (
                        <small className="ql-file-names">
                          {files.map((f) => f.name).join(", ")}
                        </small>
                      )}
                    </div>
                  ) : (
                    <TaskComposer
                      value={draft}
                      onValueChange={setDraft}
                      files={files}
                      onFilesChange={setFiles}
                      onSubmit={submit}
                      actionLabel={
                        state.active ? "Queue message" : "Send message"
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
              {current.kind === "rail" && (
                <aside className="ql-side-rail">
                  <span className="ql-eyebrow">EXECUTION ORDER</span>
                  <div className="ql-rail-active">
                    <i />
                    <span>
                      Current turn
                      <strong>{state.active ?? "No active turn"}</strong>
                    </span>
                  </div>
                  {queue}
                  {state.error && (
                    <p className="ql-error" role="alert">
                      {state.error}
                    </p>
                  )}
                </aside>
              )}
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
        <span>Messages stay local. No agent requests are sent.</span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Lab />);
