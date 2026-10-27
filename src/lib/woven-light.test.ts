import { expect, it } from "vitest";
import {
  drawWovenLight,
  WOVEN_LIGHT,
  type WovenLightFrame,
} from "./woven-light";

function render(
  time: number,
  intensity: number = WOVEN_LIGHT.intensity,
  frame: WovenLightFrame = {},
) {
  const dots: { x: number; y: number; radius: number; color: string }[] = [];
  const context = {
    canvas: { width: WOVEN_LIGHT.rasterWidth, height: 80 },
    globalAlpha: 1,
    fillStyle: "",
    clearRect() {},
    beginPath() {},
    fill() {},
    arc(x: number, y: number, radius: number) {
      dots.push({ x, y, radius, color: this.fillStyle });
    },
    fillRect(x: number, y: number, width: number, height: number) {
      // The canvas remains transparent between dots, including tiny dots.
      expect([width, height]).toEqual([2, 2]);
      dots.push({
        x: x + 1,
        y: y + 1,
        radius: Math.sqrt((this.globalAlpha * 4) / Math.PI),
        color: this.fillStyle,
      });
    },
  };
  drawWovenLight(
    context as unknown as CanvasRenderingContext2D,
    new Uint8ClampedArray(WOVEN_LIGHT.rasterWidth * 80 * 4).fill(100),
    time,
    intensity,
    context.canvas,
    frame,
  );
  return dots;
}

it("keeps the accepted size range while pools move over fixed circular dots", () => {
  const first = render(0);
  const later = render(6);
  expect(first).toHaveLength(4000);
  expect(later.map(({ x, y }) => [x, y])).toEqual(
    first.map(({ x, y }) => [x, y]),
  );
  const maximum = (WOVEN_LIGHT.rasterWidth / WOVEN_LIGHT.columns) * 0.48;
  for (const { radius } of [...first, ...later]) {
    expect(radius).toBeGreaterThanOrEqual(maximum * 0.2);
    expect(radius).toBeLessThanOrEqual(maximum * 0.7);
  }
  expect(
    later.some((dot, i) => Math.abs(dot.radius - first[i].radius) > 1),
  ).toBe(true);
  // Equal distances on opposite sides of the initial warm pool give equal sizes.
  const radiusAt = (x: number, y: number) =>
    first.find((dot) => dot.x === x && dot.y === y)!.radius;
  expect(radiusAt(796, 52)).toBe(radiusAt(804, 52));
  expect(radiusAt(812, 52)).toBeLessThan(radiusAt(804, 52));
});

it("doubles the falloff radius without increasing the peak light or dot size", () => {
  const dots = render(0, 0.4, { pools: [{ x: 0.25, y: 0.65, color: "warm" }] });
  const radius = 80 * 0.85 * 2;
  const maximum = 8 * 0.48;
  const at = (x: number) => dots.find((dot) => dot.x === x && dot.y === 52)!;
  expect(at(804).radius).toBeCloseTo(maximum * (0.7 - (0.5 * 4) / radius));
  expect(at(900).radius).toBeCloseTo(maximum * (0.7 - (0.5 * 100) / radius));
  expect(at(948).radius).toBeCloseTo(maximum * 0.2);
  expect(Math.max(...dots.map((dot) => dot.radius))).toBeLessThanOrEqual(
    maximum * 0.7,
  );
});

it("sets every dot to 20% and removes the pool's brightness and tint while focused", () => {
  const focused = render(0, 0.4, { focus: 1 });
  const later = render(40, 0.4, { focus: 1 });
  for (const dot of focused) {
    expect(dot.radius).toBeCloseTo(8 * 0.48 * 0.2, 12);
    expect(dot.color).toBe("rgb(110 110 110)");
  }
  expect(later).toEqual(focused);
  const normal = render(0);
  const halfway = render(0, 0.4, { focus: 0.5 });
  for (let i = 0; i < normal.length; i++)
    expect(halfway[i].radius).toBeCloseTo(
      (normal[i].radius + focused[i].radius) / 2,
    );
});

it("keeps full-size dots at zero intensity and permits near-zero dots at full intensity", () => {
  const full = render(0, 0);
  expect(new Set(full.map((dot) => dot.radius)).size).toBe(1);
  const varied = render(0, 1);
  expect(Math.min(...varied.map((dot) => dot.radius))).toBeGreaterThan(0);
  expect(Math.min(...varied.map((dot) => dot.radius))).toBeLessThan(0.001);
  expect(Math.max(...varied.map((dot) => dot.radius))).toBeGreaterThan(2.5);
});
