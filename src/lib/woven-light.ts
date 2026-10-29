/** Approved Woven light treatment for the new-task background. */
export const WOVEN_LIGHT = {
  intensity: 0.4,
  speed: 0.5,
  columns: 400,
  rasterWidth: 3200,
  minimumSize: 0.2,
  maximumSize: 0.7,
  focusedSize: 0.2,
  poolRadiusScale: 2,
} as const;

export const lightPools = (t: number) => [
  {
    x: 0.25 + Math.sin(t * 0.2) * 0.32,
    y: 0.5 + Math.cos(t * 0.15) * 0.2,
    color: "232, 151, 90",
  },
  {
    x: 0.75 + Math.cos(t * 0.16) * 0.3,
    y: 0.25 + Math.sin(t * 0.21) * 0.25,
    color: "81, 152, 194",
  },
];
export const wovenLightPools = (t: number) => [lightPools(t)[0]];

function sizeRange(power: number) {
  const { intensity, minimumSize, maximumSize } = WOVEN_LIGHT;
  // Calibrate the lab slider around the approved 20–70% range at 40%.
  // Its endpoints remain all-maximum dots and near-zero-to-maximum dots.
  const minimum =
    power <= intensity
      ? maximumSize + ((minimumSize - maximumSize) * power) / intensity
      : minimumSize * (1 - (power - intensity) / (1 - intensity));
  return { minimum: Math.max(0.0000001, minimum), maximum: maximumSize };
}
export type WovenLightFrame = {
  pools?: ReturnType<typeof lightPools>;
  focus?: number;
};
export function drawWovenLight(
  ctx: CanvasRenderingContext2D,
  pixels: Uint8ClampedArray,
  t: number,
  power: number = WOVEN_LIGHT.intensity,
  raster: { width: number; height: number } = ctx.canvas,
  frame: WovenLightFrame = {},
) {
  const { width: w, height: h } = raster;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  const step = w / WOVEN_LIGHT.columns;
  const pools = frame.pools ?? wovenLightPools(t);
  const [warmPool, coolPool] = pools;
  const focus = frame.focus ?? 0;
  const sizes = sizeRange(power);
  if (!renderers.has(ctx)) renderers.set(ctx, createWovenLightGpu());
  if (
    renderers
      .get(ctx)
      ?.paint(
        ctx,
        pixels,
        pools,
        power,
        WOVEN_LIGHT.columns,
        raster,
        focus,
        WOVEN_LIGHT.focusedSize,
        WOVEN_LIGHT.poolRadiusScale,
        sizes,
      )
  )
    return;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const scaled = w !== ctx.canvas.width || h !== ctx.canvas.height;
  if (scaled) {
    ctx.save();
    ctx.scale(ctx.canvas.width / w, ctx.canvas.height / h);
  }
  const poolRadius = Math.min(w * 0.34, h * 0.85) * WOVEN_LIGHT.poolRadiusScale;
  const falloff = (x: number, y: number, pool: typeof warmPool) => {
    const distance = Math.hypot(x - pool.x * w, y - pool.y * h) / poolRadius;
    return Math.max(0, 1 - distance);
  };
  for (let y = step / 2; y <= h - step / 2; y += step) {
    for (let x = step / 2; x <= w - step / 2; x += step) {
      const index = (Math.floor(y) * w + Math.floor(x)) * 4;
      const [r, g, b] = [pixels[index], pixels[index + 1], pixels[index + 2]];
      const warm = falloff(x, y, warmPool);
      const cool = coolPool ? falloff(x, y, coolPool) : 0;
      const activation = Math.max(warm, cool);
      const poolPower = power * (1 - focus);
      const light = 1 + activation * poolPower * 0.7;
      ctx.fillStyle = `rgb(${r * light + 10 + warm * poolPower * 38} ${g * light + 10 + warm * poolPower * 19 + cool * poolPower * 14} ${b * light + 10 + cool * poolPower * 40})`;
      const animatedSize =
        sizes.minimum + (sizes.maximum - sizes.minimum) * activation;
      const radius =
        step *
        0.48 *
        (animatedSize + (WOVEN_LIGHT.focusedSize - animatedSize) * focus);
      if (radius < 1) {
        // At an integer grid center, a subpixel circle covers exactly four
        // pixels equally. Use its exact area to avoid Canvas arc size bands.
        ctx.globalAlpha = (Math.PI * radius * radius) / 4;
        ctx.fillRect(x - 1, y - 1, 2, 2);
        ctx.globalAlpha = 1;
      } else {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (scaled) ctx.restore();
}
import { createWovenLightGpu } from "./woven-light-gpu";

const renderers = new WeakMap<
  CanvasRenderingContext2D,
  ReturnType<typeof createWovenLightGpu>
>();
export function disposeWovenLight(ctx: CanvasRenderingContext2D) {
  renderers.get(ctx)?.dispose();
  renderers.delete(ctx);
}
