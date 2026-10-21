// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MermaidCanvas } from "./MermaidCanvas";

let measure: () => void;
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe(element: HTMLElement) {
        Object.defineProperties(element, {
          clientWidth: { value: 800, configurable: true },
          clientHeight: { value: 600, configurable: true },
        });
        element.getBoundingClientRect = () =>
          ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;
        measure();
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Harness() {
  const [zoom, setZoom] = useState(1);
  return (
    <>
      <output aria-label="Zoom">{zoom}</output>
      <button onClick={() => setZoom(1)}>Fit</button>
      <MermaidCanvas image="diagram.svg" zoom={zoom} onZoomChange={setZoom} />
    </>
  );
}
function setup(width = 600, height = 1800) {
  const view = render(<Harness />);
  const img = view.container.querySelector("img")!;
  Object.defineProperties(img, {
    naturalWidth: { value: width, configurable: true },
    naturalHeight: { value: height, configurable: true },
  });
  fireEvent.load(img);
  const viewport = screen.getByLabelText("Diagram canvas");
  return { img, viewport };
}
function pinch(viewport: HTMLElement, deltaY: number) {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    deltaY,
    clientX: 400,
    clientY: 300,
  });
  fireEvent(viewport, event);
  return event;
}
function gesture(viewport: HTMLElement, type: string, scale: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { scale, clientX: 400, clientY: 300 });
  fireEvent(viewport, event);
  return event;
}

it("fits a tall diagram to the viewport height and recomputes the fit after resize", () => {
  const { img, viewport } = setup();
  expect(parseFloat(img.style.height)).toBeCloseTo(552);
  expect(parseFloat(img.style.width)).toBeCloseTo(184);
  expect(img.style.top).toBe("24px");
  expect(img.style.visibility).toBe("visible");
  Object.defineProperty(viewport, "clientHeight", {
    value: 400,
    configurable: true,
  });
  act(() => measure());
  expect(parseFloat(img.style.height)).toBeCloseTo(352);
});

it("fits wide diagrams to the available width and preserves the natural size of small diagrams", () => {
  const { img } = setup(1800, 600);
  expect(parseFloat(img.style.width)).toBeCloseTo(752);
  expect(parseFloat(img.style.height)).toBeCloseTo(752 / 3);
  Object.defineProperties(img, {
    naturalWidth: { value: 120 },
    naturalHeight: { value: 80 },
  });
  fireEvent.load(img);
  expect(img.style.width).toBe("120px");
  expect(img.style.height).toBe("80px");
});

it("zooms at the pinch location while leaving ordinary two-finger scrolling available for panning", () => {
  const { img, viewport } = setup();
  expect(pinch(viewport, -Math.log(2) / 0.01).defaultPrevented).toBe(true);
  expect(Number(screen.getByLabelText("Zoom").textContent)).toBeCloseTo(2);
  expect(parseFloat(img.style.height)).toBeCloseTo(1104);
  expect(viewport.scrollTop).toBeCloseTo(276);
  const scroll = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaX: 30,
    deltaY: 50,
  });
  fireEvent(viewport, scroll);
  expect(scroll.defaultPrevented).toBe(false);
  expect(Number(screen.getByLabelText("Zoom").textContent)).toBeCloseTo(2);
  pinch(viewport, -10000);
  expect(screen.getByLabelText("Zoom").textContent).toBe("4");
  pinch(viewport, 10000);
  expect(screen.getByLabelText("Zoom").textContent).toBe("0.25");
  fireEvent.click(screen.getByText("Fit"));
  expect(parseFloat(img.style.height)).toBeCloseTo(552);
});

it("supports WebKit gesture scales without compounding or double-handling wheel events", () => {
  const { viewport } = setup();
  expect(gesture(viewport, "gesturestart", 1).defaultPrevented).toBe(true);
  gesture(viewport, "gesturechange", 1.5);
  expect(screen.getByLabelText("Zoom").textContent).toBe("1.5");
  gesture(viewport, "gesturechange", 2);
  expect(screen.getByLabelText("Zoom").textContent).toBe("2");
  pinch(viewport, -50);
  expect(screen.getByLabelText("Zoom").textContent).toBe("2");
  gesture(viewport, "gestureend", 2);
  gesture(viewport, "gesturestart", 1);
  gesture(viewport, "gesturechange", 0.5);
  expect(screen.getByLabelText("Zoom").textContent).toBe("1");
});
