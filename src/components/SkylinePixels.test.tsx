// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { drawWovenLight } from "@/lib/woven-light";
import { SkylinePixels } from "./SkylinePixels";

vi.mock("@/lib/woven-light", async (original) => ({
  ...(await original<typeof import("@/lib/woven-light")>()),
  drawWovenLight: vi.fn(),
}));

let callbacks: Map<number, FrameRequestCallback>;
let requestId: number;
let reduced: boolean;
let motion: EventTarget;
let hidden: boolean;
let image: { current: HTMLImageElement };
const context = {
  drawImage: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
};
const animationContext = {
  getImageData: vi.fn(() => {
    throw new Error("Animation surface must not be read back");
  }),
};

beforeEach(() => {
  callbacks = new Map();
  requestId = 0;
  reduced = false;
  hidden = false;
  motion = new EventTarget();
  Object.defineProperty(motion, "matches", { get: () => reduced });
  vi.stubGlobal("matchMedia", () => motion);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.set(++requestId, callback);
    return requestId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.spyOn(HTMLCanvasElement.prototype, "clientWidth", "get").mockReturnValue(
    1000,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "clientHeight", "get").mockReturnValue(
    500,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return (this.classList.contains("skyline-pixels")
        ? animationContext
        : context) as unknown as CanvasRenderingContext2D;
    },
  );
  const artwork = document.createElement("img");
  Object.defineProperties(artwork, {
    complete: { value: true },
    naturalWidth: { value: 1000 },
    naturalHeight: { value: 740 },
  });
  image = { current: artwork };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function advance(time: number) {
  vi.mocked(performance.now).mockReturnValue(time);
  const pending = [...callbacks.values()];
  callbacks.clear();
  act(() => pending.forEach((callback) => callback(time)));
}

it("samples the same centered cover crop as the blurred image and animates at half speed", () => {
  const { container, unmount } = render(
    <SkylinePixels image={image} source="dawn.webp" active />,
  );
  expect(context.drawImage).toHaveBeenCalledWith(
    image.current,
    0,
    120,
    1000,
    500,
    0,
    0,
    3200,
    1600,
  );
  expect(container.querySelector("canvas")!.dataset.ready).toBe("true");
  expect(container.querySelector("canvas")!.width).toBe(1000);
  expect(container.querySelector("canvas")!.height).toBe(500);
  expect(animationContext.getImageData).not.toHaveBeenCalled();
  expect(vi.mocked(drawWovenLight).mock.calls.at(-1)![4]).toEqual({
    width: 3200,
    height: 1600,
  });
  advance(60);
  expect(vi.mocked(drawWovenLight).mock.calls.at(-1)![2]).toBeCloseTo(0.03);
  expect(callbacks.size).toBe(1);
  unmount();
  expect(callbacks.size).toBe(0);
});

it("follows pointer events inside the frame and stays with the cursor until it leaves", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.spyOn(
    HTMLCanvasElement.prototype,
    "getBoundingClientRect",
  ).mockReturnValue({
    left: 100,
    top: 50,
    width: 1000,
    height: 500,
  } as DOMRect);
  const { container } = render(
    <div data-skyline-background="true">
      <SkylinePixels image={image} source="night.webp" active />
    </div>,
  );
  const scene = container.firstElementChild!;
  const canvas = container.querySelector("canvas")!;
  fireEvent.pointerMove(scene, { clientX: 850, clientY: 175 });
  advance(16);
  expect(canvas.dataset.motion).toBe("cursor");
  expect(vi.mocked(drawWovenLight).mock.calls.at(-1)![5]!.pools).toHaveLength(
    1,
  );
  advance(700);
  expect(canvas.dataset.motion).toBe("cursor");
  fireEvent.pointerMove(scene, { clientX: 450, clientY: 225 });
  advance(716);
  expect(canvas.dataset.motion).toBe("cursor");
  fireEvent.pointerLeave(scene);
  advance(732);
  expect(canvas.dataset.motion).toBe("ambient");
});

it("settles all dots on composer focus, stops repainting, and resumes on blur", () => {
  const { container, getByRole } = render(
    <div data-skyline-background="true">
      <SkylinePixels image={image} source="night.webp" active />
      <div className="task-composer">
        <input aria-label="Composer" />
        <button>Model</button>
      </div>
      <button>Outside</button>
    </div>,
  );
  const editor = getByRole("textbox");
  act(() => editor.focus());
  for (let frame = 1; frame <= 60; frame++) advance((frame * 1000) / 120);
  expect(vi.mocked(drawWovenLight).mock.calls.at(-1)![5]!.focus).toBe(1);
  expect(container.querySelector("canvas")!.dataset.motion).toBe("focused");
  expect(callbacks.size).toBe(0);
  act(() => getByRole("button", { name: "Model" }).focus());
  expect(callbacks.size).toBe(0);
  act(() => getByRole("button", { name: "Outside" }).focus());
  expect(callbacks.size).toBe(1);
  for (let frame = 61; frame <= 120; frame++) advance((frame * 1000) / 120);
  expect(vi.mocked(drawWovenLight).mock.calls.at(-1)![5]!.focus).toBe(0);
  expect(callbacks.size).toBe(1);
});

it("updates focused dots immediately with reduced motion and schedules no frames", () => {
  reduced = true;
  const { getByRole } = render(
    <div data-skyline-background="true">
      <SkylinePixels image={image} source="night.webp" active />
      <div className="task-composer">
        <input aria-label="Composer" />
      </div>
    </div>,
  );
  act(() => getByRole("textbox").focus());
  expect(vi.mocked(drawWovenLight).mock.calls.at(-1)![5]!.focus).toBe(1);
  expect(callbacks.size).toBe(0);
});

it("uses Retina display resolution without changing the artwork sampling grid", () => {
  vi.stubGlobal("devicePixelRatio", 2);
  const { container } = render(
    <SkylinePixels image={image} source="night.webp" active />,
  );
  const canvas = container.querySelector("canvas")!;
  expect([canvas.width, canvas.height]).toEqual([2000, 1000]);
  expect(vi.mocked(drawWovenLight).mock.calls.at(-1)![4]).toEqual({
    width: 3200,
    height: 1600,
  });
});

it("stops scheduling when hidden, inactive, or reduced motion is enabled", () => {
  const { container, rerender } = render(
    <SkylinePixels image={image} source="day.webp" active />,
  );
  hidden = true;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(callbacks.size).toBe(0);
  const paints = vi.mocked(drawWovenLight).mock.calls.length;
  advance(6000);
  expect(drawWovenLight).toHaveBeenCalledTimes(paints);
  hidden = false;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(callbacks.size).toBe(1);
  reduced = true;
  act(() => motion.dispatchEvent(new Event("change")));
  expect(callbacks.size).toBe(0);
  expect(container.querySelector("canvas")!.dataset.ready).toBe("true");
  reduced = false;
  act(() => motion.dispatchEvent(new Event("change")));
  expect(callbacks.size).toBe(1);
  rerender(<SkylinePixels image={image} source="day.webp" active={false} />);
  expect(callbacks.size).toBe(0);
  expect(container.querySelector("canvas")!.dataset.ready).toBeUndefined();
});

it("paints every display refresh, including 120 Hz, without speeding up the pools", () => {
  render(<SkylinePixels image={image} source="night.webp" active />);
  const initial = vi.mocked(drawWovenLight).mock.calls.length;
  for (let frame = 1; frame <= 120; frame++) advance((frame * 1000) / 120);
  expect(drawWovenLight).toHaveBeenCalledTimes(initial + 120);
  expect(vi.mocked(drawWovenLight).mock.calls.at(-1)![2]).toBeCloseTo(0.5);
});
