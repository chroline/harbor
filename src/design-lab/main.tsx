import {
  StrictMode,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Maximize2,
  Pause,
  Play,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { artwork, concepts, type City, type Period } from "./concepts";
import { Scene } from "./Scene";
import { WOVEN_LIGHT } from "../lib/woven-light";
import "./styles.css";

const initialFocus = () => {
  const index = concepts.findIndex((c) => `#${c.id}` === location.hash);
  return index < 0 ? null : index;
};
const initialShortlist = (): string[] => {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem("harbor-background-lab-shortlist") ?? "[]",
    );
    return Array.isArray(saved)
      ? saved.filter(
          (id): id is string =>
            typeof id === "string" && concepts.some((c) => c.id === id),
        )
      : [];
  } catch {
    return [];
  }
};

function Composer({
  large = false,
  light = false,
}: {
  large?: boolean;
  light?: boolean;
}) {
  return (
    <div
      className={`scene-composer ${large ? "is-large" : ""} ${light ? "is-light" : ""}`}
    >
      <h3>What would you like to work on?</h3>
      <div className="composer-surface">
        {large ? (
          <textarea
            aria-label="Sample prompt"
            placeholder="Describe what you want to work on…"
            rows={2}
          />
        ) : (
          <span className="composer-placeholder">
            Describe what you want to work on…
          </span>
        )}
        <div className="composer-tools">
          <span>＋</span>
          <span>
            Codex <ChevronDown />
          </span>
          <span className="composer-mode">
            Default <ChevronDown />
          </span>
          <span className="composer-send">↑</span>
        </div>
      </div>
    </div>
  );
}

function Lab() {
  const [city, setCity] = useState<City>("sf");
  const [period, setPeriod] = useState<Period>("night");
  const [paused, setPaused] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [showComposer, setShowComposer] = useState(true);
  const [selected, setSelected] = useState<number | null>(initialFocus);
  const [shortlist, setShortlist] = useState<string[]>(initialShortlist);
  const [tuning, setTuning] = useState<
    Record<string, { intensity: number; speed: number }>
  >({});
  const dialog = useRef<HTMLDialogElement>(null);
  const source = artwork[city][period];
  const light = period === "day" || period === "dawn";
  useEffect(() => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [light]);
  const current = selected === null ? null : concepts[selected];
  const settings = (id: string) =>
    tuning[id] ??
    (id === "weave"
      ? { intensity: WOVEN_LIGHT.intensity, speed: WOVEN_LIGHT.speed }
      : { intensity: 0.7, speed: 1 });
  const focus = (index: number | null) => {
    setSelected(index);
    history.replaceState(
      null,
      "",
      index === null ? location.pathname : `#${concepts[index].id}`,
    );
  };
  const toggle = (id: string) =>
    setShortlist((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id],
    );
  useEffect(() => {
    try {
      localStorage.setItem(
        "harbor-background-lab-shortlist",
        JSON.stringify(shortlist),
      );
    } catch {
      /* Private browsing may disable storage. */
    }
  }, [shortlist]);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setPaused(motion.matches);
    motion.addEventListener("change", change);
    return () => motion.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (selected !== null && !dialog.current?.open) dialog.current?.showModal();
    if (selected !== null && dialog.current) dialog.current.scrollTop = 0;
    if (selected === null && dialog.current?.open) dialog.current.close();
    document.body.style.overflow = selected === null ? "" : "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selected]);
  useEffect(() => {
    const change = () => setSelected(initialFocus());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);

  const sceneControls = (
    <>
      <label className="select-control">
        <span>City</span>
        <select
          aria-label="Background city"
          value={city}
          onChange={(event) => setCity(event.target.value as City)}
        >
          <option value="sf">San Francisco</option>
          <option value="la">Los Angeles</option>
          <option value="nyc">New York City</option>
        </select>
        <ChevronDown />
      </label>
      <label className="select-control">
        <span>Light</span>
        <select
          aria-label="Time of day"
          value={period}
          onChange={(event) => setPeriod(event.target.value as Period)}
        >
          <option value="dawn">Dawn</option>
          <option value="day">Day</option>
          <option value="sunset">Sunset</option>
          <option value="night">Night</option>
        </select>
        <ChevronDown />
      </label>
    </>
  );
  const motionButton = (
    <button
      className="control-button"
      onClick={() => setPaused(!paused)}
      aria-pressed={paused}
    >
      {paused ? <Play /> : <Pause />}
      {paused ? "Play motion" : "Pause motion"}
    </button>
  );
  const composerButton = (
    <button
      className="control-button composer-toggle"
      onClick={() => setShowComposer(!showComposer)}
      aria-pressed={showComposer}
    >
      <span className="check-box">{showComposer && <Check />}</span>Show
      composer
    </button>
  );

  return (
    <main className="lab-shell">
      <header className="lab-heading">
        <div className="lab-brand">
          <span className="harbor-mark">h</span>
          <span>
            Harbor <span className="brand-divider">/</span> Design lab
          </span>
          <span className="lab-badge">STUDY 01</span>
        </div>
        <div className="heading-row">
          <div>
            <p className="eyebrow">SIX DIRECTIONS. ONE CANVAS.</p>
            <h1>
              Background studies<span>.</span>
            </h1>
            <p className="intro">
              Different ways to make the scene feel alive. Open a study, tune
              the motion, and keep the ones worth exploring.
            </p>
          </div>
          <a className="jump-link" href="#studies">
            Explore the studies <ArrowDown />
          </a>
        </div>
      </header>
      <section className="lab-toolbar" aria-label="Shared preview controls">
        <div className="source-controls">{sceneControls}</div>
        <div className="playback-controls">
          {composerButton}
          {motionButton}
        </div>
      </section>
      <section
        className="study-grid"
        id="studies"
        aria-label="Six background concepts"
      >
        {concepts.map((concept, index) => (
          <article
            className="study-card"
            key={concept.id}
            style={{ "--study-accent": concept.accent } as CSSProperties}
          >
            <button
              className="study-preview"
              aria-label={`Explore ${concept.name}`}
              onClick={() => focus(index)}
            >
              <Scene
                id={concept.id}
                source={source}
                light={light}
                paused={paused || selected !== null}
                {...settings(concept.id)}
              />
              <div className="scene-shade" />
              {showComposer && (
                <div aria-hidden="true">
                  <Composer light={light} />
                </div>
              )}
              <span className="study-index">0{index + 1}</span>
              <span className="expand-hint">
                <Maximize2 /> Explore
              </span>
            </button>
            <div className="study-meta">
              <div className="study-title-row">
                <h2>{concept.name}</h2>
                <span className="study-category">{concept.category}</span>
                <button
                  className={`shortlist-button ${shortlist.includes(concept.id) ? "is-selected" : ""}`}
                  aria-label={`${shortlist.includes(concept.id) ? "Remove" : "Shortlist"} ${concept.name}`}
                  aria-pressed={shortlist.includes(concept.id)}
                  onClick={() => toggle(concept.id)}
                >
                  <Star />
                </button>
              </div>
              <p>{concept.description}</p>
            </div>
          </article>
        ))}
      </section>
      <footer className="lab-footer">
        <div>
          <span className="footer-dot" />
          {paused ? "Motion paused" : "Live studies"}
          <span className="footer-divider">·</span>Open any study for a
          full-size preview
        </div>
        <div className="shortlist-summary" aria-live="polite">
          {shortlist.length ? (
            <>
              <Star />
              Shortlisted:{" "}
              {concepts
                .filter((c) => shortlist.includes(c.id))
                .map((c) => c.name)
                .join(", ")}
            </>
          ) : (
            "Nothing shortlisted yet. Trust your eye."
          )}
        </div>
      </footer>

      <dialog
        ref={dialog}
        className="study-dialog"
        aria-labelledby="detail-title"
        onCancel={(event) => {
          event.preventDefault();
          focus(null);
        }}
        onClose={() => {
          if (selected !== null) focus(null);
        }}
      >
        {current && selected !== null && (
          <div
            className="detail-layout"
            style={{ "--study-accent": current.accent } as CSSProperties}
          >
            <header className="detail-header">
              <button className="back-button" onClick={() => focus(null)}>
                <ArrowLeft />
                All studies
              </button>
              <span className="detail-count">
                0{selected + 1}
                <span> / 06</span>
              </span>
              <button
                className="icon-button"
                aria-label="Close study"
                onClick={() => focus(null)}
              >
                <X />
              </button>
            </header>
            <div className="detail-stage">
              <Scene
                key={current.id}
                id={current.id}
                source={source}
                light={light}
                paused={paused}
                {...settings(current.id)}
              />
              <div className="scene-shade" />
              {showComposer && <Composer large light={light} />}
              <div className="stage-caption">
                <span>{current.category}</span>
                <span>
                  {showComposer
                    ? "Type a sample prompt to test readability"
                    : "Artwork only"}
                </span>
              </div>
            </div>
            <div className="detail-bottom">
              <div className="detail-description">
                <p className="eyebrow">
                  STUDY 0{selected + 1} / {current.category.toUpperCase()}
                </p>
                <h2 id="detail-title">{current.name}</h2>
                <p>{current.detail}</p>
                <div className="material-tags">
                  <span>{current.texture}</span>
                  <span>{current.motion}</span>
                </div>
                <button
                  className={`favorite-action ${shortlist.includes(current.id) ? "is-selected" : ""}`}
                  onClick={() => toggle(current.id)}
                  aria-pressed={shortlist.includes(current.id)}
                >
                  <Star />
                  {shortlist.includes(current.id)
                    ? "Shortlisted"
                    : "Keep on shortlist"}
                </button>
              </div>
              <section className="detail-controls" aria-label="Tune this study">
                <h3>
                  <SlidersHorizontal />
                  Tune this study
                </h3>
                <label className="range-control">
                  <span>
                    Intensity{" "}
                    <output>
                      {Math.round(settings(current.id).intensity * 100)}%
                    </output>
                  </span>
                  <input
                    aria-label="Effect intensity"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings(current.id).intensity}
                    onChange={(event) =>
                      setTuning({
                        ...tuning,
                        [current.id]: {
                          ...settings(current.id),
                          intensity: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label className="select-control speed-control">
                  <span>Motion speed</span>
                  <select
                    aria-label="Motion speed"
                    value={settings(current.id).speed}
                    onChange={(event) =>
                      setTuning({
                        ...tuning,
                        [current.id]: {
                          ...settings(current.id),
                          speed: Number(event.target.value),
                        },
                      })
                    }
                  >
                    <option value="0.5">Slow · 0.5×</option>
                    <option value="1">Original · 1×</option>
                    <option value="1.75">Lively · 1.75×</option>
                  </select>
                  <ChevronDown />
                </label>
                <div className="detail-source-controls">{sceneControls}</div>
                <div className="detail-playback">
                  {motionButton}
                  {composerButton}
                </div>
              </section>
            </div>
            <nav className="detail-navigation" aria-label="Browse studies">
              <button onClick={() => focus((selected + 5) % 6)}>
                <ArrowLeft />
                <span>{concepts[(selected + 5) % 6].name}</span>
              </button>
              <span>These are explorations. Nothing is applied to Harbor.</span>
              <button onClick={() => focus((selected + 1) % 6)}>
                <span>{concepts[(selected + 1) % 6].name}</span>
                <ArrowRight />
              </button>
            </nav>
          </div>
        )}
      </dialog>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);
