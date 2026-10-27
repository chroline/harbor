import { useEffect, useRef, type RefObject } from "react";

const FRAME_INTERVAL = 1000 / 24;
const FOLLOW_MS = 65;
const ARTWORK_SCALE = 1.1;
const TILT_DEGREES = 8;
const smooth = (value: number) => value * value * (3 - 2 * value);

/** Fixed artwork pixels, a cursor-following light, and image-only card tilt. */
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

  useEffect(() => {
    const element = canvas.current;
    const artwork = image.current;
    const landscape = element?.parentElement;
    const surface = element?.closest<HTMLElement>(".skyline-scene");
    if (!element || !artwork || !landscape || !surface || !active) return;
    delete element.dataset.ready;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let context: CanvasRenderingContext2D | null = null;
    let pixels: ImageData | null = null;
    let frame: ImageData | null = null;
    const focus = { x: 0.5, y: 0.5 };
    const target = { ...focus };
    let request = 0;
    let lastFrame = 0;
    let lastTick = 0;

    const tilt = () => {
      const x = motion?.matches ? 0 : (focus.y - 0.5) * TILT_DEGREES;
      const y = motion?.matches ? 0 : (0.5 - focus.x) * TILT_DEGREES;
      // Only the two artwork layers inherit these transforms, never the UI.
      landscape.style.setProperty("--skyline-tilt-x", `${x}deg`);
      landscape.style.setProperty("--skyline-tilt-y", `${y}deg`);
    };

    const paint = () => {
      if (!context || !pixels || !frame) return;
      if (motion?.matches) {
        context.putImageData(pixels, 0, 0);
      } else {
        const { width, height, data } = pixels;
        // Account for the overscan that keeps the tilted image edges hidden.
        const centerX = (0.5 + (focus.x - 0.5) / ARTWORK_SCALE) * width;
        const centerY = (0.5 + (focus.y - 0.5) / ARTWORK_SCALE) * height;
        const radius = Math.min(width, height) * 0.38;
        for (let y = 0; y < height; y++) {
          const dy = (y - centerY) / radius;
          for (let x = 0; x < width; x++) {
            const dx = (x - centerX) / radius;
            const distanceSquared = dx * dx + dy * dy;
            const intensity =
              distanceSquared < 1 ? smooth(1 - Math.sqrt(distanceSquared)) : 0;
            const index = (y * width + x) * 4;
            // Only brightness changes; every color sample stays in its original cell.
            for (let channel = 0; channel < 3; channel++) {
              const color = data[index + channel];
              frame.data[index + channel] =
                color + intensity * (20 + color * 0.35);
            }
            frame.data[index + 3] = 255;
          }
        }
        context.putImageData(frame, 0, 0);
      }
      element.dataset.ready = "true";
    };

    const moving = () =>
      Math.hypot(target.x - focus.x, target.y - focus.y) > 0.0005;

    const animate = (now: number) => {
      request = 0;
      if (document.hidden || motion?.matches || !pixels) return;
      const amount = 1 - Math.exp(-Math.min(now - lastTick, 100) / FOLLOW_MS);
      focus.x += (target.x - focus.x) * amount;
      focus.y += (target.y - focus.y) * amount;
      if (!moving()) Object.assign(focus, target);
      tilt();
      lastTick = now;
      // Keep the transform smooth at display rate; pixel painting costs more.
      if (now - lastFrame >= FRAME_INTERVAL || !moving()) {
        paint();
        lastFrame = now;
      }
      // A stationary pointer needs no continuous redraws.
      if (moving()) request = requestAnimationFrame(animate);
    };

    const followPointer = (event: PointerEvent) => {
      if (event.pointerType === "touch" || motion?.matches) return;
      // Measure the stationary container so tilt cannot feed back into itself.
      const bounds = landscape.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      target.x = Math.max(
        0,
        Math.min(1, (event.clientX - bounds.left) / bounds.width),
      );
      target.y = Math.max(
        0,
        Math.min(1, (event.clientY - bounds.top) / bounds.height),
      );
      if (!request && !document.hidden && pixels && moving()) {
        request = requestAnimationFrame(animate);
      }
    };

    const resetPointer = () => {
      Object.assign(target, { x: 0.5, y: 0.5 });
      if (
        !request &&
        !document.hidden &&
        !motion?.matches &&
        pixels &&
        moving()
      )
        request = requestAnimationFrame(animate);
    };

    const resume = () => {
      cancelAnimationFrame(request);
      request = 0;
      if (motion?.matches) {
        Object.assign(focus, { x: 0.5, y: 0.5 });
        Object.assign(target, focus);
      }
      tilt();
      if (document.hidden || !pixels) return;
      paint();
      if (!motion?.matches && moving())
        request = requestAnimationFrame(animate);
    };

    const prepare = () => {
      if (!artwork.complete || !artwork.naturalWidth) return;
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      landscape.style.setProperty(
        "--skyline-perspective",
        `${Math.max(width, height) * 2.5}px`,
      );
      // Keep fine artwork detail while bounding work on large/Retina displays.
      const size = Math.max(2, width / 750, height / 500);
      element.width = Math.ceil(width / size);
      element.height = Math.ceil(height / size);
      context = element.getContext("2d");
      if (!context) return;
      const scale = Math.max(
        width / artwork.naturalWidth,
        height / artwork.naturalHeight,
      );
      const cropWidth = width / scale;
      const cropHeight = height / scale;
      // Match the image's cover / center top crop and shared CSS transform exactly.
      context.drawImage(
        artwork,
        (artwork.naturalWidth - cropWidth) / 2,
        0,
        cropWidth,
        cropHeight,
        0,
        0,
        element.width,
        element.height,
      );
      pixels = context.getImageData(0, 0, element.width, element.height);
      frame = context.createImageData(element.width, element.height);
      resume();
    };

    artwork.addEventListener("load", prepare);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(prepare);
    observer?.observe(element);
    window.addEventListener("resize", prepare);
    // Listen on the scene, leaving the decorative canvas transparent to clicks.
    surface.addEventListener("pointermove", followPointer, { passive: true });
    surface.addEventListener("pointerenter", followPointer, { passive: true });
    surface.addEventListener("pointerleave", resetPointer);
    window.addEventListener("blur", resetPointer);
    document.addEventListener("visibilitychange", resume);
    motion?.addEventListener("change", resume);
    prepare();
    return () => {
      cancelAnimationFrame(request);
      observer?.disconnect();
      artwork.removeEventListener("load", prepare);
      window.removeEventListener("resize", prepare);
      surface.removeEventListener("pointermove", followPointer);
      surface.removeEventListener("pointerenter", followPointer);
      surface.removeEventListener("pointerleave", resetPointer);
      window.removeEventListener("blur", resetPointer);
      document.removeEventListener("visibilitychange", resume);
      motion?.removeEventListener("change", resume);
      landscape.style.removeProperty("--skyline-tilt-x");
      landscape.style.removeProperty("--skyline-tilt-y");
      landscape.style.removeProperty("--skyline-perspective");
    };
  }, [image, source, active]);

  return (
    <canvas
      ref={canvas}
      className="skyline-pixels"
      data-active={active}
      aria-hidden="true"
    />
  );
}
