import { wovenLightPools } from "./woven-light";

const FOCUS_SECONDS = 0.45;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

/** Small animation state, updated outside React and shared by all dots. */
export function createWovenLightMotion() {
  let pointer: { x: number; y: number } | null = null;
  let followed = { x: 0.5, y: 0.5 };
  let influence = 0;
  let focused = false;
  let focusProgress = 0;

  return {
    move(x: number, y: number) {
      if (pointer?.x === x && pointer.y === y) return;
      if (!pointer && influence === 0) followed = { x, y };
      pointer = { x: clamp(x), y: clamp(y) };
    },
    leave() {
      pointer = null;
    },
    focus(active: boolean) {
      focused = active;
    },
    step(time: number, seconds: number, reduced = false) {
      const following = !reduced && pointer !== null;
      const target = following ? 1 : 0;
      influence = reduced
        ? 0
        : mix(
            influence,
            target,
            1 - Math.exp(-seconds / (following ? 0.18 : 0.45)),
          );
      if (Math.abs(influence - target) < 0.001) influence = target;
      if (pointer) {
        const ease = 1 - Math.exp(-seconds / 0.12);
        followed.x = mix(followed.x, pointer.x, ease);
        followed.y = mix(followed.y, pointer.y, ease);
      }
      // One finite transition makes every radius settle on the same frame.
      const focusTarget = focused ? 1 : 0;
      focusProgress = reduced
        ? focusTarget
        : focusProgress +
          Math.sign(focusTarget - focusProgress) *
            Math.min(
              Math.abs(focusTarget - focusProgress),
              seconds / FOCUS_SECONDS,
            );
      const focus = focusProgress * focusProgress * (3 - 2 * focusProgress);
      const pools = wovenLightPools(time).map((pool) => {
        return {
          ...pool,
          x: mix(pool.x, followed.x, influence),
          y: mix(pool.y, followed.y, influence),
        };
      });
      return { pools, focus, following };
    },
  };
}
