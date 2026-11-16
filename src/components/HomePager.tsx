import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";

// While the composer is in use, the cards sit this far beneath it.
const REST_GAP = 32;
// Otherwise the composer and cards form one block, centered when it fits:
// this far apart, and at least this far from the pager edges.
const BLOCK_GAP = 32;
const BOTTOM_GAP = 24;
const TOP_GAP = 8;
// Weighty, but settles without a wobble.
const HEAVY = { type: "spring", stiffness: 170, damping: 26, mass: 1.2 } as const;
// Popovers opened from the composer render outside it; using them is still
// using the composer.
const COMPOSER_POPUPS =
  '[data-radix-popper-content-wrapper], [role="dialog"], [role="menu"], [role="listbox"]';

/**
 * The new-task page: the composer and the dashboard cards sit together,
 * centered. Focusing the composer moves its card to the middle of the window
 * and lets the cards drop away, faded, beneath it; losing focus brings them back.
 */
export function HomePager({ children, sheet }: { children: ReactNode; sheet: ReactNode }) {
  const pager = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // "Revealed" is the default: everything visible as one centered block.
  const revealed = useRef(true);
  // Track positions: the composer card centered in the window, and the whole
  // block centered in the window.
  const composingY = useRef(0);
  const revealedY = useRef(0);
  // Sheet offsets from its natural spot (just below the full-height hero),
  // while composing and while revealed.
  const sheetRest = useRef(0);
  const sheetRevealed = useRef(0);
  const reduced = useReducedMotion();
  const y = useMotionValue(0);
  const progress = useTransform(y, (value) => {
    const span = revealedY.current - composingY.current;
    return span ? Math.min(1, Math.max(0, (value - composingY.current) / span)) : 1;
  });
  // While composing, the cards read as "more below" rather than as content.
  const sheetOpacity = useTransform(progress, [0, 1], [0.65, 1]);
  const sheetScale = useTransform(progress, [0, 1], [0.97, 1]);
  // Set directly rather than derived, so a re-measure moves the sheet even
  // when the composer position has not changed.
  const sheetY = useMotionValue(0);
  const syncSheet = () => {
    const p = progress.get();
    sheetY.set(sheetRest.current + p * (sheetRevealed.current - sheetRest.current));
  };
  useEffect(() => progress.on("change", syncSheet), []);

  const restingY = () => (revealed.current ? revealedY.current : composingY.current);
  const setRevealed = (next: boolean) => {
    if (revealed.current === next) return;
    revealed.current = next;
    pager.current?.toggleAttribute("data-revealed", next);
    animate(y, restingY(), reduced ? { duration: 0 } : HEAVY);
  };

  // Everything centers on the window, not on the pager: the pager starts
  // below the floating topbar.
  useLayoutEffect(() => {
    const root = pager.current;
    const panel = sheetRef.current;
    if (!root || !panel) return;
    const measure = () => {
      const height = root.clientHeight;
      if (hero.current) hero.current.style.height = `${height}px`;
      const content = hero.current?.firstElementChild as HTMLElement | null;
      const contentTop = content?.offsetTop ?? 0;
      const contentHeight = content?.offsetHeight ?? 0;
      const pagerTop = root.getBoundingClientRect().top;
      const middle = window.innerHeight / 2 - pagerTop;
      // The composer card, untransformed, in pager coordinates.
      const card = content?.querySelector<HTMLElement>(".task-composer") ?? content;
      const cardRect = card?.getBoundingClientRect();
      const cardTop = cardRect ? cardRect.top - pagerTop - y.get() : contentTop;
      const cardHeight = cardRect?.height ?? contentHeight;
      composingY.current = middle - cardHeight / 2 - cardTop;
      // The cards themselves, not the sheet's bottom padding.
      const cards = (panel.firstElementChild as HTMLElement | null)?.offsetHeight ?? panel.offsetHeight;
      const block = contentHeight + BLOCK_GAP + cards;
      let blockTop = Math.max(TOP_GAP, middle - block / 2);
      if (blockTop + block > height - BOTTOM_GAP)
        blockTop = Math.max(TOP_GAP - pagerTop, height - BOTTOM_GAP - block);
      revealedY.current = blockTop - contentTop;
      // Both are in track coordinates, so only the gap under the composer differs.
      sheetRest.current = contentTop + contentHeight + REST_GAP - height;
      sheetRevealed.current = contentTop + contentHeight + BLOCK_GAP - height;
      if (!y.isAnimating()) y.set(restingY());
      syncSheet();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(panel);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // The composer itself, not the full-window hero around it.
  const composer = () => hero.current?.firstElementChild ?? null;
  const inComposer = (node: Node | null) =>
    !!node &&
    (!!composer()?.contains(node) ||
      (node instanceof Element && !!node.closest(COMPOSER_POPUPS)));


  return (
    <div ref={pager} className="home-pager" data-revealed="">
      <motion.div className="home-pager-track" style={{ y }}>
        <div
          ref={hero}
          className="home-pager-hero"
          // Focus decides: in the composer, it centers and the cards drop away;
          // anywhere else (a click outside, Tab, ⌘K, a card), they come back.
          onFocusCapture={(event) => {
            if (inComposer(event.target)) setRevealed(false);
          }}
          // Esc leaves the composer, unless a menu or suggestion list used it.
          onKeyDown={(event) => {
            const active = document.activeElement;
            if (
              event.key === "Escape" &&
              !event.defaultPrevented &&
              active instanceof HTMLElement &&
              composer()?.contains(active)
            )
              active.blur();
          }}
          onBlurCapture={() => {
            requestAnimationFrame(() => {
              if (!inComposer(document.activeElement)) setRevealed(true);
            });
          }}
        >
          {children}
        </div>
        <motion.div
          ref={sheetRef}
          className="home-pager-sheet"
          style={{ y: sheetY, opacity: sheetOpacity, scale: sheetScale }}
          onFocusCapture={() => setRevealed(true)}
        >
          {sheet}
        </motion.div>
      </motion.div>
    </div>
  );
}
