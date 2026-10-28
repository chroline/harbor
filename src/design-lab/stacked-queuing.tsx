import { useEffect, useReducer, useState } from "react";
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
} from "lucide-react";
import { TaskComposer } from "../components/TaskComposer";
import { PromptQueue } from "../components/PromptQueue";
import { demoScenario, queueDemoReducer } from "./queue-simulator";
import "../styles.css";
import "./queuing.css";
import "./stacked-queuing.css";

const variants = [
  {
    name: "Quiet outline",
    note: "Fine outlines and open spacing keep each instruction easy to scan.",
    kind: "quiet",
    tag: "01 · AIRY AND RESTRAINED",
  },
  {
    name: "Connected stack",
    note: "A shared container groups the queue into one compact unit.",
    kind: "connected",
    tag: "02 · ONE COHESIVE GROUP",
  },
  {
    name: "Soft bubbles",
    note: "Soft individual surfaces make each queued thought feel distinct.",
    kind: "bubbles",
    tag: "03 · GENTLE SEPARATION",
  },
  {
    name: "Order rail",
    note: "A continuous line and numbered markers make sequence prominent.",
    kind: "order",
    tag: "04 · SEQUENCE FIRST",
  },
  {
    name: "Next up",
    note: "The first message gets more emphasis while the rest remain compact.",
    kind: "next",
    tag: "05 · FOCUS ON WHAT'S NEXT",
  },
  {
    name: "Minimal list",
    note: "Hairline dividers and a small count strip leave more room for content.",
    kind: "minimal",
    tag: "06 · LIGHTEST CHROME",
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
  const queue = (
    <div className={`ql-queue stacked-study stacked-study-${current.kind}`}>
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
    </div>
  );
  return (
    <main className="ql-shell stacked-lab">
      <header className="ql-header">
        <a href="/labs/stacked-queuing.html" className="ql-brand">
          <Anchor size={18} /> Harbor <span>/ Design lab</span>
        </a>
        <span className="ql-local">
          <i /> Local simulation
        </span>
      </header>
      <section className="ql-intro">
        <div>
          <span className="ql-eyebrow">STACKED ROWS · SIX NEW STUDIES</span>
          <h1>
            One familiar stack.
            <br />
            <span>Six ways to make it yours.</span>
          </h1>
          <p>
            Six variations on queued messages stacked above the composer.
            <br className="ql-desktop-break" /> Compare the details; the
            behavior stays the same.
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
                </div>
                <div className="ql-compose-area">
                  {queue}
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
        <span>All six studies use the same stacked queue behavior.</span>
        <span>
          Messages stay local. No agent requests are sent.{" "}
          <a href="/labs/queuing.html">Original studies ↗</a>
        </span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Lab />);
