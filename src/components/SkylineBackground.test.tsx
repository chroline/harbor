// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  skylinePeriod,
  skylineTimeOfDay,
  type SkylinePeriod,
} from "@/lib/skyline-period";
import { HomeScene, SkylineScene } from "./SkylineBackground";
import { skylineCity } from "@/lib/skyline-city";
import { createPortal } from "react-dom";
import { ComposerPickerSurface } from "./composer-picker";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.classList.remove("light", "dark");
});

const themeCases = [
  [6, "light", "dark"],
  [12, "light", "dark"],
  [18, "dark", "light"],
  [22, "dark", "light"],
] as const;

it.each([undefined, null, "unknown", "toString", {}, "automatic"])(
  "defaults saved time of day %s to automatic",
  (value) => expect(skylineTimeOfDay(value)).toBe("automatic"),
);

it.each(
  (["sf", "la", "nyc"] as const).flatMap((city) =>
    (["home", "chat"] as const).flatMap((variant) =>
      (["dawn", "day", "sunset", "night"] as const).map((period) => ({
        city,
        variant,
        period,
      })),
    ),
  ),
)(
  "keeps $city $variant fixed at $period and shares its theme",
  ({ city, variant, period }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 12));
    const theme = period === "dawn" || period === "day" ? "light" : "dark";
    document.documentElement.classList.add(theme);
    const { container } = render(
      <SkylineScene frame city={city} timeOfDay={period} variant={variant}>
        <SkylineScene variant={variant}>
          {createPortal(
            <ComposerPickerSurface>Menu</ComposerPickerSurface>,
            document.body,
          )}
        </SkylineScene>
      </SkylineScene>,
    );
    const check = () => {
      expect(container.querySelector("img")!.getAttribute("src")).toContain(
        `/${city}/${period}.webp`,
      );
      for (const scene of container.querySelectorAll(".skyline-scene")) {
        expect(scene.classList.contains(theme)).toBe(true);
      }
      expect(
        document
          .querySelector(".composer-picker-menu")!
          .classList.contains(theme),
      ).toBe(true);
      expect(document.documentElement.classList.contains(theme)).toBe(true);
    };
    check();
    act(() => vi.advanceTimersByTime(12 * 60 * 60 * 1000));
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    check();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("shares one automatic clock and immediately resumes it after a fixed selection", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 20, 16, 59));
  const view = (timeOfDay: "automatic" | SkylinePeriod) => (
    <SkylineScene frame timeOfDay={timeOfDay}>
      <HomeScene />
      <SkylineScene variant="chat" />
    </SkylineScene>
  );
  const { container, rerender, unmount } = render(view("automatic"));
  expect(vi.getTimerCount()).toBe(1);
  act(() => vi.advanceTimersByTime(60_000));
  expect(container.querySelector("img")!.dataset.skylinePeriod).toBe("sunset");
  for (const scene of container.querySelectorAll(".skyline-scene")) {
    expect(scene.classList.contains("dark")).toBe(true);
  }
  rerender(view("dawn"));
  expect(vi.getTimerCount()).toBe(0);
  vi.setSystemTime(new Date(2026, 9, 20, 22));
  rerender(view("automatic"));
  expect(container.querySelector("img")!.dataset.skylinePeriod).toBe("night");
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps one background mounted while home and keyed chats change", () => {
  const view = (variant: "home" | "chat", key: string) => (
    <SkylineScene frame variant={variant}>
      <SkylineScene key={key} variant={variant} />
    </SkylineScene>
  );
  const { container, rerender } = render(view("home", "home"));
  const image = container.querySelector("img");
  for (const [variant, key] of [
    ["chat", "first"],
    ["chat", "second"],
    ["home", "home"],
  ] as const) {
    rerender(view(variant, key));
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("img")).toBe(image);
    expect(
      container
        .querySelector(".skyline-frame")
        ?.getAttribute("data-skyline-variant"),
    ).toBe(variant);
  }
});

it.each(
  (["home", "chat"] as const).flatMap((variant) =>
    themeCases.map(([hour, theme, appTheme]) => ({
      variant,
      hour,
      theme,
      appTheme,
    })),
  ),
)(
  "themes the $variant scene at $hour:00 and its portaled menus for the $appTheme app",
  ({ variant, hour, appTheme }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, hour));
    document.documentElement.classList.add(appTheme);
    const { container } = render(
      <SkylineScene variant={variant}>
        {createPortal(
          <ComposerPickerSurface>Menu content</ComposerPickerSurface>,
          document.body,
        )}
      </SkylineScene>,
    );
    expect(
      container.querySelector(".skyline-scene")!.classList.contains(appTheme),
    ).toBe(true);
    expect(
      document
        .querySelector(".composer-picker-menu")!
        .classList.contains(appTheme),
    ).toBe(true);
    expect(document.documentElement.classList.contains(appTheme)).toBe(true);
    const period = container.querySelector("img")!.dataset.skylinePeriod;
    expect(appTheme === "light" ? ["dawn", "day"] : ["sunset", "night"]).toContain(period);
  },
);

it.each(["sf", "la", "nyc"] as const)(
  "uses the %s artwork through every time of day",
  (city) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 6));
    const { container } = render(<HomeScene city={city} />);
    for (const [hour, period] of [
      [6, "dawn"],
      [12, "day"],
      [18, "sunset"],
      [22, "night"],
    ] as const) {
      vi.setSystemTime(new Date(2026, 9, 20, hour));
      act(() => window.dispatchEvent(new Event("focus")));
      expect(container.querySelector("img")!.getAttribute("src")).toContain(
        `/${city}/${period}.webp`,
      );
    }
  },
);

it("switches cities without resetting the clock or creating another timer", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 20, 18));
  const { container, rerender } = render(<HomeScene />);
  rerender(<HomeScene city="nyc" />);
  expect(container.querySelector("img")!.getAttribute("src")).toContain(
    "/nyc/sunset.webp",
  );
  expect(vi.getTimerCount()).toBe(1);
});

it.each([undefined, null, "unknown", "toString", {}])(
  "defaults invalid saved city %s to San Francisco",
  (value) => {
    expect(skylineCity(value)).toBe("sf");
  },
);

it.each([
  [0, 0, "night"],
  [4, 59, "night"],
  [5, 0, "dawn"],
  [7, 59, "dawn"],
  [8, 0, "day"],
  [16, 59, "day"],
  [17, 0, "sunset"],
  [19, 59, "sunset"],
  [20, 0, "night"],
  [23, 59, "night"],
] as const)("uses local time at %i:%i for %s", (hour, minute, expected) => {
  expect(skylinePeriod(new Date(2026, 9, 20, hour, minute))).toBe(expected);
});

it("updates an open page across a time boundary and clears its timer on unmount", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 20, 16, 59, 30));
  const { container, unmount } = render(<HomeScene />);
  const image = container.querySelector("img")!;
  expect(image.dataset.skylinePeriod).toBe("day");
  expect(image.getAttribute("src")).toContain("/sf/day.webp");
  expect(
    container.querySelector(".home-page")!.classList.contains("light"),
  ).toBe(true);
  act(() => vi.advanceTimersByTime(60_000));
  expect(image.dataset.skylinePeriod).toBe("sunset");
  expect(image.getAttribute("src")).toContain("/sf/sunset.webp");
  expect(
    container.querySelector(".home-page")!.classList.contains("dark"),
  ).toBe(true);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["focus", "visibilitychange"])(
  "refreshes on %s after the clock jumps",
  (event) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 19));
    const { container } = render(<HomeScene />);
    vi.setSystemTime(new Date(2026, 9, 21, 6));
    act(() =>
      (event === "focus" ? window : document).dispatchEvent(new Event(event)),
    );
    expect(container.querySelector("img")!.dataset.skylinePeriod).toBe("dawn");
  },
);
