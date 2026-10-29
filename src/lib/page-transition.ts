import { flushSync } from "react-dom";

let running: ViewTransition | undefined;

/** Capture the outgoing page before React replaces it, then cross-blur both snapshots. */
export function transitionPage(update: () => void) {
  if (
    !document.startViewTransition ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }

  running?.skipTransition();
  // Snapshot pseudo-elements live outside the shell and cannot inherit its clip.
  const frame = document.querySelector(".main-content");
  document.documentElement.style.setProperty(
    "--page-frame-radius",
    frame ? getComputedStyle(frame).borderRadius : "0px",
  );
  const transition = document.startViewTransition(() => flushSync(update));
  running = transition;
  // A superseded transition can reject `ready`; navigation must still complete.
  void transition.ready.catch(() => {});
  void transition.finished.finally(() => {
    if (running === transition) running = undefined;
  });
}
