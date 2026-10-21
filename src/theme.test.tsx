// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import App from "./App";
import { browserBootstrap } from "./lib/api";

const mocks = vi.hoisted(() => ({
  desktop: true,
  preference: "dark",
  systemDark: false,
  override: null as "dark" | "light" | null,
  setTheme: vi.fn(),
}));
vi.mock("./lib/api", async (original) => ({
  ...(await original<typeof import("./lib/api")>()),
  get desktop() {
    return mocks.desktop;
  },
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTheme: mocks.setTheme }),
}));
vi.mock("./lib/store", () => ({
  useStore: () => ({
    data: { ...browserBootstrap, settings: { theme: mocks.preference } },
    ready: true,
    error: null,
    refresh: vi.fn(),
    setError: vi.fn(),
    updateSession: vi.fn(),
  }),
}));
vi.mock("./lib/provider-config", () => ({
  useProviderConfig: () => ({ busy: false, selections: {} }),
}));
vi.mock("./components/ModelMenu", () => ({
  DiscoveryModelMenu: () => null,
}));

let media: EventTarget;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.desktop = true;
  mocks.preference = "dark";
  mocks.systemDark = false;
  mocks.override = null;
  media = new EventTarget();
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    get matches() {
      return query.includes("prefers-color-scheme")
        ? mocks.override === null
          ? mocks.systemDark
          : mocks.override === "dark"
        : query.includes("reduced-motion");
    },
    media: query,
    addEventListener: media.addEventListener.bind(media),
    removeEventListener: media.removeEventListener.bind(media),
    addListener() {},
    removeListener() {},
  }));
  mocks.setTheme.mockImplementation(async (theme) => {
    mocks.override = theme;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.scrollTo = vi.fn();
  document.documentElement.className = "";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("releases a forced dark native appearance before resolving System on a light OS", async () => {
  const { rerender } = render(<App />);
  await waitFor(() => expect(mocks.override).toBe("dark"));
  expect(document.documentElement.classList.contains("dark")).toBe(true);

  mocks.preference = "system";
  rerender(<App />);
  await waitFor(() =>
    expect(document.documentElement.classList.contains("light")).toBe(true),
  );
  expect(mocks.setTheme).toHaveBeenLastCalledWith(null);
  expect(mocks.override).toBeNull();

  // OS changes must update the page without forcing the native window again.
  const calls = mocks.setTheme.mock.calls.length;
  act(() => {
    mocks.systemDark = true;
    media.dispatchEvent(new Event("change"));
  });
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(mocks.setTheme).toHaveBeenCalledTimes(calls);
  act(() => {
    mocks.systemDark = false;
    media.dispatchEvent(new Event("change"));
  });
  expect(document.documentElement.classList.contains("light")).toBe(true);
});

it("keeps explicit Light and Dark independent of system appearance", async () => {
  mocks.preference = "light";
  mocks.systemDark = true;
  const { rerender } = render(<App />);
  await waitFor(() =>
    expect(document.documentElement.classList.contains("light")).toBe(true),
  );
  expect(mocks.setTheme).toHaveBeenLastCalledWith("light");
  mocks.preference = "dark";
  rerender(<App />);
  await waitFor(() =>
    expect(document.documentElement.classList.contains("dark")).toBe(true),
  );
  expect(mocks.setTheme).toHaveBeenLastCalledWith("dark");
});

it("follows system changes in the browser preview without calling native APIs", () => {
  mocks.desktop = false;
  mocks.preference = "system";
  render(<App />);
  expect(document.documentElement.classList.contains("light")).toBe(true);
  act(() => {
    mocks.systemDark = true;
    media.dispatchEvent(new Event("change"));
  });
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(mocks.setTheme).not.toHaveBeenCalled();
});
