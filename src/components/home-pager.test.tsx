// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MotionConfig } from "framer-motion";
import { HomePager } from "./HomePager";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(cleanup);

const ui = () => (
  <MotionConfig reducedMotion="always">
    <button>Sidebar</button>
    <HomePager sheet={<button>Card row</button>}>
      <div>
        <textarea aria-label="Composer" />
        <button>Choose model</button>
      </div>
    </HomePager>
  </MotionConfig>
);
const revealed = () =>
  (document.querySelector(".home-pager") as HTMLElement).hasAttribute("data-revealed");
// Leaving is decided after a short settle (a closing menu hands focus back late).
const frame = () => new Promise((resolve) => setTimeout(resolve, 100));

it("shows the cards by default", () => {
  render(ui());
  expect(revealed()).toBe(true);
});

it("centers the composer while it has focus and brings the cards back after", async () => {
  render(ui());
  screen.getByLabelText("Composer").focus();
  expect(revealed()).toBe(false);
  screen.getByRole("button", { name: "Sidebar" }).focus();
  await frame();
  expect(revealed()).toBe(true);
});

it("leaves the composer on Esc, and on focus moving to a card", async () => {
  render(ui());
  const composer = screen.getByLabelText("Composer");
  composer.focus();
  fireEvent.keyDown(composer, { key: "Escape" });
  await frame();
  expect(revealed()).toBe(true);
  composer.focus();
  expect(revealed()).toBe(false);
  screen.getByRole("button", { name: "Card row" }).focus();
  await frame();
  expect(revealed()).toBe(true);
});

it("leaves the layout alone when a composer button takes focus", async () => {
  render(ui());
  const model = screen.getByRole("button", { name: "Choose model" });
  model.focus();
  expect(revealed()).toBe(true);
  // From the text field, the button still counts as the composer.
  screen.getByLabelText("Composer").focus();
  expect(revealed()).toBe(false);
  model.focus();
  await frame();
  expect(revealed()).toBe(false);
});

it("ignores scrolling", () => {
  render(ui());
  const pager = document.querySelector(".home-pager") as HTMLElement;
  for (let i = 0; i < 6; i++)
    pager.dispatchEvent(new WheelEvent("wheel", { deltaY: 80, bubbles: true }));
  expect(revealed()).toBe(true);
});
