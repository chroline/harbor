import { expect, it } from "vitest";
import { createWovenLightMotion } from "./woven-light-motion";
import { wovenLightPools } from "./woven-light";

it("follows and stays at the cursor until it leaves the frame", () => {
  const motion = createWovenLightMotion();
  expect(motion.step(0, 0).pools).toEqual(wovenLightPools(0));
  let frame = motion.step(0, 0);
  for (let i = 1; i <= 180; i++) {
    motion.move(0.6 + i * 0.001, 0.3);
    frame = motion.step(i / 240, 1 / 120);
  }
  expect(frame.following).toBe(true);
  expect(frame.pools).toHaveLength(1);
  expect(frame.pools[0].x).toBeCloseTo(0.78, 1);
  expect(frame.pools[0].y).toBeCloseTo(0.3, 2);
  for (let i = 1; i <= 1200; i++) frame = motion.step(0.75 + i / 240, 1 / 120);
  expect(frame.following).toBe(true);
  expect(frame.pools[0].x).toBeCloseTo(0.78, 8);
  expect(frame.pools[0].y).toBeCloseTo(0.3, 8);
  motion.leave();
  for (let i = 1; i <= 480; i++) frame = motion.step(5.75 + i / 240, 1 / 120);
  expect(frame.following).toBe(false);
  expect(frame.pools[0].x).toBeCloseTo(wovenLightPools(7.75)[0].x, 8);
  expect(frame.pools[0].y).toBeCloseTo(wovenLightPools(7.75)[0].y, 8);
});

it("leaves cursor mode immediately on exit, with a smooth return", () => {
  const motion = createWovenLightMotion();
  motion.move(0.9, 0.1);
  const before = motion.step(0, 0.4);
  motion.leave();
  const after = motion.step(0.01, 1 / 120);
  expect(after.following).toBe(false);
  expect(Math.abs(after.pools[0].x - before.pools[0].x)).toBeLessThan(0.03);
});

it("finishes one shared focus transition, reverses smoothly, and honors reduced motion", () => {
  const motion = createWovenLightMotion();
  motion.focus(true);
  expect(motion.step(0, 0.225).focus).toBeCloseTo(0.5);
  expect(motion.step(0, 0.225).focus).toBe(1);
  motion.focus(false);
  expect(motion.step(0, 0.225).focus).toBeCloseTo(0.5);
  expect(motion.step(0, 0.225).focus).toBe(0);
  motion.move(0.9, 0.2);
  motion.focus(true);
  const reduced = motion.step(0, 0, true);
  expect(reduced.focus).toBe(1);
  expect(reduced.following).toBe(false);
  expect(reduced.pools).toEqual(wovenLightPools(0));
});
