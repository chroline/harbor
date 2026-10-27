import { useEffect, useRef, type RefObject } from "react";
import {
  disposeWovenLight,
  drawWovenLight,
  WOVEN_LIGHT,
} from "@/lib/woven-light";
import { createWovenLightMotion } from "@/lib/woven-light-motion";

/** Fixed circular dots over the separately blurred skyline image. */
export function SkylinePixels({
  image,
  source,
  active,
}: {
  image: RefObject<HTMLImageElement | null>;
  source: string;
  active: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const elapsed = useRef(0);

  useEffect(() => {
    const element = canvas.current;
    const artwork = image.current;
    if (!element) return;
    delete element.dataset.ready;
    if (!artwork || !active) return;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const scene = element.closest<HTMLElement>(
      '[data-skyline-background="true"]',
    );
    const interaction = createWovenLightMotion();
    let bounds: DOMRect | null = null;
    let context: CanvasRenderingContext2D | null = null;
    let pixels: ImageData | null = null;
    let raster: { width: number; height: number } = {
      width: WOVEN_LIGHT.rasterWidth,
      height: 0,
    };
    let request = 0;
    let previous = 0;
    let visible = true;
    let composerActive = false;

    const paint = (seconds = 0) => {
      if (!context || !pixels) return;
      const frame = interaction.step(elapsed.current, seconds, motion?.matches);
      drawWovenLight(
        context,
        pixels.data,
        elapsed.current,
        WOVEN_LIGHT.intensity,
        raster,
        frame,
      );
      if (element.dataset.ready !== "true") element.dataset.ready = "true";
      const mode =
        frame.focus === 1 ? "focused" : frame.following ? "cursor" : "ambient";
      if (element.dataset.motion !== mode) element.dataset.motion = mode;
      return frame;
    };
    const animate = (now: number) => {
      request = 0;
      if (document.hidden || !visible || motion?.matches || !pixels) return;
      const seconds = Math.min(now - previous, 80) / 1000;
      elapsed.current += seconds * WOVEN_LIGHT.speed;
      previous = now;
      const frame = paint(seconds);
      // Once focused, the uniform dots and absent pool are completely static.
      if (!composerActive || frame?.focus !== 1)
        request = requestAnimationFrame(animate);
    };
    const resume = () => {
      cancelAnimationFrame(request);
      request = 0;
      if (document.hidden || !visible || !pixels) return;
      const frame = paint();
      previous = performance.now();
      if (!motion?.matches && (!composerActive || frame?.focus !== 1))
        request = requestAnimationFrame(animate);
    };
    const prepare = () => {
      if (!artwork.complete || !artwork.naturalWidth || !artwork.naturalHeight)
        return;
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      bounds = element.getBoundingClientRect();
      // Keep the exact eight-pixel sampling grid, but present at display
      // resolution. Reading artwork pixels must not demote the animation's
      // canvas to a CPU-backed surface.
      const sampling = document.createElement("canvas");
      sampling.width = WOVEN_LIGHT.rasterWidth;
      sampling.height = Math.round((height / width) * sampling.width);
      raster = { width: sampling.width, height: sampling.height };
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        sampling.width / width,
      );
      element.width = Math.max(1, Math.round(width * ratio));
      element.height = Math.max(1, Math.round(height * ratio));
      context = element.getContext("2d");
      const sampler = sampling.getContext("2d", { willReadFrequently: true });
      if (!context || !sampler) return;
      const scale = Math.max(
        width / artwork.naturalWidth,
        height / artwork.naturalHeight,
      );
      const cropWidth = width / scale;
      const cropHeight = height / scale;
      // Both layers use cover / center, without any independent scaling.
      sampler.drawImage(
        artwork,
        (artwork.naturalWidth - cropWidth) / 2,
        (artwork.naturalHeight - cropHeight) / 2,
        cropWidth,
        cropHeight,
        0,
        0,
        sampling.width,
        sampling.height,
      );
      pixels = sampler.getImageData(0, 0, sampling.width, sampling.height);
      sampling.width = sampling.height = 0;
      resume();
    };

    const move = (event: PointerEvent) => {
      if (
        event.pointerType === "touch" ||
        motion?.matches ||
        !bounds?.width ||
        !bounds.height
      )
        return;
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) {
        interaction.leave();
        return;
      }
      interaction.move(x, y);
    };
    const enter = () => {
      bounds = element.getBoundingClientRect();
    };
    const leave = () => interaction.leave();
    const composerFocused = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest(".task-composer") &&
      !!scene?.contains(target);
    const setFocus = (target: EventTarget | null) => {
      const focused = composerFocused(target);
      composerActive = focused;
      interaction.focus(focused);
      element.dataset.composerActive = String(focused);
      // Reduced motion still responds to focus, without scheduling animation.
      if (motion?.matches) paint();
      else if (!request) resume();
    };
    const focusIn = (event: FocusEvent) => setFocus(event.target);
    const focusOut = (event: FocusEvent) => setFocus(event.relatedTarget);

    scene?.addEventListener("pointerenter", enter);
    scene?.addEventListener("pointermove", move, { passive: true });
    scene?.addEventListener("pointerleave", leave);
    scene?.addEventListener("pointercancel", leave);
    scene?.addEventListener("focusin", focusIn);
    scene?.addEventListener("focusout", focusOut);
    setFocus(document.activeElement);

    artwork.addEventListener("load", prepare);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(prepare);
    observer?.observe(element);
    const intersection =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            resume();
          });
    intersection?.observe(element);
    window.addEventListener("resize", prepare);
    document.addEventListener("visibilitychange", resume);
    motion?.addEventListener("change", resume);
    prepare();
    return () => {
      cancelAnimationFrame(request);
      if (context) disposeWovenLight(context);
      observer?.disconnect();
      intersection?.disconnect();
      artwork.removeEventListener("load", prepare);
      window.removeEventListener("resize", prepare);
      document.removeEventListener("visibilitychange", resume);
      motion?.removeEventListener("change", resume);
      scene?.removeEventListener("pointerenter", enter);
      scene?.removeEventListener("pointermove", move);
      scene?.removeEventListener("pointerleave", leave);
      scene?.removeEventListener("pointercancel", leave);
      scene?.removeEventListener("focusin", focusIn);
      scene?.removeEventListener("focusout", focusOut);
      delete element.dataset.motion;
      delete element.dataset.composerActive;
    };
  }, [image, source, active]);

  return (
    <canvas
      ref={canvas}
      className="skyline-pixels"
      data-effect="woven-light"
      data-active={active}
      aria-hidden="true"
    />
  );
}
