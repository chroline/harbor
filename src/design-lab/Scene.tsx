import { useEffect, useRef, useState } from "react";
import type { ConceptId } from "./concepts";
import {
  disposeWovenLight,
  drawWovenLight,
  lightPools,
  WOVEN_LIGHT,
} from "../lib/woven-light";

const images = new Map<string, Promise<HTMLImageElement>>();
function loadImage(source: string) {
  if (!images.has(source))
    images.set(
      source,
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = source;
      }),
    );
  return images.get(source)!;
}

function cover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  w: number,
  h: number,
) {
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(
    image,
    (image.naturalWidth - sw) / 2,
    (image.naturalHeight - sh) / 2,
    sw,
    sh,
    0,
    0,
    w,
    h,
  );
}

type Material = {
  image: HTMLCanvasElement;
  data: Uint8ClampedArray;
  channels: HTMLCanvasElement[];
};
function material(image: HTMLImageElement, w: number, h: number): Material {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  cover(ctx, image, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const channels = [0, 1, 2].map((channel) => {
    const layer = document.createElement("canvas");
    layer.width = w;
    layer.height = h;
    const context = layer.getContext("2d")!;
    const pixels = context.createImageData(w, h);
    for (let i = 0; i < data.length; i += 4) {
      pixels.data[i + channel] = data[i + channel];
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return layer;
  });
  return { image: canvas, data, channels };
}

const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function paint(
  ctx: CanvasRenderingContext2D,
  m: Material,
  id: ConceptId,
  t: number,
  power: number,
  lightTheme = false,
) {
  if (id === "weave") {
    drawWovenLight(ctx, m.data, t, power, m.image);
    return;
  }
  const { width: w, height: h } = ctx.canvas;
  const sample = (x: number, y: number) => {
    const i =
      (Math.min(h - 1, Math.max(0, Math.floor(y))) * w +
        Math.min(w - 1, Math.max(0, Math.floor(x)))) *
      4;
    return [m.data[i], m.data[i + 1], m.data[i + 2]];
  };
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(m.image, 0, 0);

  if (id === "tide") {
    ctx.fillStyle = lightTheme
      ? "rgba(245, 244, 235, .1)"
      : "rgba(5, 13, 25, .23)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "screen";
    for (const pool of lightPools(t)) {
      const gradient = ctx.createRadialGradient(
        w * pool.x,
        h * pool.y,
        0,
        w * pool.x,
        h * pool.y,
        w * 0.65,
      );
      gradient.addColorStop(0, `rgba(${pool.color}, ${power * 0.48})`);
      gradient.addColorStop(1, `rgba(${pool.color}, 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }
  } else if (id === "glass") {
    const pane = w / 7;
    for (let i = 0; i < 7; i++) {
      const x = i * pane;
      const shift = Math.sin(t * 0.35 + i * 0.8) * pane * 0.27 * power;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, 0, pane, h);
      ctx.clip();
      ctx.drawImage(m.image, x - shift, 0, pane + shift * 2, h, x, 0, pane, h);
      const shine = ctx.createLinearGradient(x, 0, x + pane, 0);
      shine.addColorStop(0, `rgba(222,240,255,${0.06 + power * 0.17})`);
      shine.addColorStop(0.18, "rgba(190,215,235,0)");
      shine.addColorStop(0.85, "rgba(5,20,35,0)");
      shine.addColorStop(1, `rgba(4,12,24,${0.12 + power * 0.18})`);
      ctx.fillStyle = shine;
      ctx.fillRect(x, 0, pane, h);
      ctx.restore();
    }
  } else if (id === "contour") {
    ctx.fillStyle = lightTheme
      ? "rgba(236, 240, 229, .9)"
      : "rgba(7, 24, 27, .86)";
    ctx.fillRect(0, 0, w, h);
    const step = Math.max(6, h / 35);
    for (let y = -step; y < h + step * 2; y += step) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const [r, g, b] = sample(x, y);
        const luminance = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
        const wave =
          Math.sin((x / w) * 8 + t * 0.35 + (y / h) * 3) * 7 +
          Math.cos((x / w) * 15 - t * 0.2) * 3;
        const py = y - luminance * h * 0.12 + wave * power;
        if (x === 0) ctx.moveTo(x, py);
        else ctx.lineTo(x, py);
      }
      ctx.strokeStyle = `rgba(${lightTheme ? "46, 83, 65" : "152, 217, 192"}, ${0.22 + (Math.sin((y / h) * 7 + t * 0.2) + 1) * 0.17})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  } else if (id === "dither") {
    ctx.fillStyle = lightTheme ? "#edf0e5" : "#132233";
    ctx.fillRect(0, 0, w, h);
    const step = Math.max(2, Math.round(w / 250));
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const [r, g, b] = sample(x, y);
        const luminance = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
        const bloom =
          Math.sin((x / w) * 6 + t * 0.3) * Math.cos((y / h) * 5 - t * 0.24);
        const value = luminance * 1.25 + bloom * power * 0.2;
        const threshold = bayer[((y / step) % 4) * 4 + ((x / step) % 4)] / 16;
        if (value > threshold) {
          ctx.fillStyle = lightTheme
            ? bloom > 0.05
              ? "#8b5945"
              : "#436b72"
            : bloom > 0.05
              ? "#e9b7a3"
              : "#88b4b3";
          ctx.fillRect(x, y, step, step);
        }
      }
    }
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "screen";
    const drift = (Math.sin(t * 0.55) * 0.5 + 0.5) * power * w * 0.018;
    m.channels.forEach((channel, i) => {
      const offset = (i - 1) * drift;
      ctx.drawImage(channel, -10 + offset, -5, w + 20, h + 10);
    });
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(8,12,22,.16)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,.12)";
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  }
  ctx.globalCompositeOperation = "source-over";
}

export function Scene({
  id,
  source,
  light,
  paused,
  intensity,
  speed,
}: {
  id: ConceptId;
  source: string;
  light: boolean;
  paused: boolean;
  intensity: number;
  speed: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const elapsed = useRef(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    delete canvas.dataset.ready;
    let disposed = false;
    let image: HTMLImageElement | null = null;
    let surface: Material | null = null;
    let frame = 0;
    let previous = 0;
    let lastPaint = 0;
    let visible = true;
    const draw = () =>
      surface && paint(ctx, surface, id, elapsed.current, intensity, light);
    const tick = (now: number) => {
      frame = 0;
      if (disposed || paused || !visible || document.hidden || !surface) return;
      elapsed.current += (Math.min(now - previous, 80) / 1000) * speed;
      previous = now;
      if (id === "weave" || now - lastPaint >= 1000 / 24) {
        draw();
        lastPaint = now;
      }
      frame = requestAnimationFrame(tick);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (!visible || document.hidden || !surface) return;
      draw();
      previous = performance.now();
      if (!paused) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      if (!image) return;
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      // Eight raster pixels per cell preserve circular edges before downsampling.
      // The weave renderer handles subpixel radii with exact area coverage.
      const scale =
        id === "weave"
          ? Math.min(
              window.devicePixelRatio || 1,
              WOVEN_LIGHT.rasterWidth / bounds.width,
            )
          : Math.min(1, 1000 / bounds.width);
      canvas.width = Math.round(bounds.width * scale);
      canvas.height = Math.round(bounds.height * scale);
      surface =
        id === "weave"
          ? material(
              image,
              WOVEN_LIGHT.rasterWidth,
              Math.round(
                (bounds.height / bounds.width) * WOVEN_LIGHT.rasterWidth,
              ),
            )
          : material(image, canvas.width, canvas.height);
      canvas.dataset.ready = "true";
      resume();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      resume();
    });
    intersection.observe(canvas);
    document.addEventListener("visibilitychange", resume);
    setFailed(false);
    loadImage(source)
      .then((loaded) => {
        if (disposed) return;
        image = loaded;
        resize();
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (id === "weave") disposeWovenLight(ctx);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", resume);
    };
  }, [id, source, light, paused, intensity, speed]);
  return (
    <>
      {id === "weave" && (
        <img
          className="study-blurred-image"
          src={source}
          alt=""
          aria-hidden="true"
        />
      )}
      <canvas ref={ref} className="study-canvas" aria-hidden="true" />
      {failed && (
        <span className="scene-error" role="status">
          Artwork unavailable. Reload to try again.
        </span>
      )}
    </>
  );
}
