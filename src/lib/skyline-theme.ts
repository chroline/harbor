import { useEffect, useState } from "react";
import type { SkylinePeriod, SkylineTimeOfDay } from "./skyline-period";

/** Observe the resolved application theme, including changes to system appearance. */
export function useSkylineTheme(): "light" | "dark" | undefined {
  const read = () => document.documentElement.classList.contains("light")
    ? "light" as const
    : document.documentElement.classList.contains("dark") ? "dark" as const : undefined;
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    setTheme(read());
    return () => observer.disconnect();
  }, []);
  return theme;
}

export function periodForTheme(period: SkylinePeriod, theme: "light" | "dark" | undefined): SkylinePeriod {
  if (theme === "light") return period === "sunset" ? "dawn" : period === "night" ? "day" : period;
  if (theme === "dark") return period === "dawn" ? "sunset" : period === "day" ? "night" : period;
  return period;
}

export function timeForTheme(time: SkylineTimeOfDay, theme: "light" | "dark" | undefined): SkylineTimeOfDay {
  return time === "automatic" ? time : periodForTheme(time, theme);
}
