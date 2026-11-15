import {
  forwardRef,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react";
import {
  skylinePeriod,
  type SkylinePeriod,
  type SkylineTimeOfDay,
} from "@/lib/skyline-period";
import { periodForTheme, useSkylineTheme } from "@/lib/skyline-theme";
import type { SkylineCity } from "@/lib/skyline-city";
import { ComposerThemeContext } from "@/lib/composer-theme";
import { SkylinePixels } from "./SkylinePixels";
import dawn from "@/assets/artwork/sf/dawn.webp";
import day from "@/assets/artwork/sf/day.webp";
import sunset from "@/assets/artwork/sf/sunset.webp";
import night from "@/assets/artwork/sf/night.webp";
import laDawn from "@/assets/artwork/la/dawn.webp";
import laDay from "@/assets/artwork/la/day.webp";
import laSunset from "@/assets/artwork/la/sunset.webp";
import laNight from "@/assets/artwork/la/night.webp";
import nycDawn from "@/assets/artwork/nyc/dawn.webp";
import nycDay from "@/assets/artwork/nyc/day.webp";
import nycSunset from "@/assets/artwork/nyc/sunset.webp";
import nycNight from "@/assets/artwork/nyc/night.webp";

const artwork = {
  sf: { dawn, day, sunset, night },
  la: { dawn: laDawn, day: laDay, sunset: laSunset, night: laNight },
  nyc: { dawn: nycDawn, day: nycDay, sunset: nycSunset, night: nycNight },
};

interface SceneProps extends HTMLAttributes<HTMLDivElement> {
  city?: SkylineCity;
  timeOfDay?: SkylineTimeOfDay;
  variant?: "home" | "chat";
  frame?: boolean;
  active?: boolean;
}

const SkylineFrameContext = createContext(false);
const SkylinePeriodContext = createContext<SkylinePeriod | undefined>(
  undefined,
);

export function HomeScene(props: Omit<SceneProps, "variant">) {
  return <SkylineScene {...props} variant="home" />;
}

export const SkylineScene = forwardRef<HTMLDivElement, SceneProps>(
  function SkylineScene(
    {
      city = "sf",
      timeOfDay = "automatic",
      variant = "home",
      frame = false,
      active = true,
      className = "",
      children,
      style,
      ...props
    },
    ref,
  ) {
    const [clockPeriod, setClockPeriod] = useState(() => skylinePeriod());
    const inheritedPeriod = useContext(SkylinePeriodContext);
    const appTheme = useSkylineTheme();
    const period = inheritedPeriod ?? periodForTheme(
      timeOfDay === "automatic" ? clockPeriod : timeOfDay, appTheme,
    );
    const scene = useRef<HTMLDivElement | null>(null);
    const sharedBackground = useContext(SkylineFrameContext);

    // Pinned prompts paint an opaque copy of the scene behind their corners.
    // Measure only the scene frame; scrolling stays entirely native CSS.
    useLayoutEffect(() => {
      const element = scene.current;
      if (sharedBackground || !element) return;
      const shell = element.closest(".app-shell");
      const sidebar = shell?.querySelector<HTMLElement>("#harbor-sidebar");
      const card = () =>
        sidebar?.querySelector<HTMLElement>('[data-sidebar="sidebar"]') ?? null;
      let frame = 0;
      let steady = 0;
      // The card slides on a longer transform than the shell's width spring.
      // Follow the card's painted edge so the artwork moves with the sidebar.
      const measure = () => {
        const sceneBox = element.getBoundingClientRect();
        const cardBox = card()?.getBoundingClientRect();
        const edge = cardBox ? Math.max(0, cardBox.right) : sceneBox.left;
        const next = {
          left: Math.min(edge, sceneBox.right),
          top: sceneBox.top,
          width: Math.max(0, sceneBox.right - Math.min(edge, sceneBox.right)),
          height: sceneBox.height,
        };
        let moved = false;
        for (const [key, value] of Object.entries(next)) {
          const current = Number.parseFloat(
            element.style.getPropertyValue(`--skyline-${key}`),
          );
          if (!Number.isFinite(current) || Math.abs(current - value) >= 0.5) {
            element.style.setProperty(`--skyline-${key}`, `${value}px`);
            moved = true;
          }
        }
        return moved;
      };
      const tick = () => {
        frame = 0;
        steady = measure() ? 0 : steady + 1;
        if (steady < 4) frame = requestAnimationFrame(tick);
      };
      const kick = () => {
        steady = 0;
        if (!frame) frame = requestAnimationFrame(tick);
      };
      measure();
      const observer =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(kick);
      observer?.observe(element);
      sidebar?.addEventListener("transitionrun", kick);
      sidebar?.addEventListener("transitionend", kick);
      window.addEventListener("resize", kick);
      return () => {
        if (frame) cancelAnimationFrame(frame);
        observer?.disconnect();
        sidebar?.removeEventListener("transitionrun", kick);
        sidebar?.removeEventListener("transitionend", kick);
        window.removeEventListener("resize", kick);
      };
    }, [sharedBackground]);

    useEffect(() => {
      if (inheritedPeriod !== undefined || timeOfDay !== "automatic") return;
      const refresh = () => setClockPeriod(skylinePeriod());
      refresh();
      const timer = window.setInterval(refresh, 60_000);
      // Timers can pause while the desktop window is asleep or hidden.
      window.addEventListener("focus", refresh);
      document.addEventListener("visibilitychange", refresh);
      return () => {
        window.clearInterval(timer);
        window.removeEventListener("focus", refresh);
        document.removeEventListener("visibilitychange", refresh);
      };
    }, [inheritedPeriod, timeOfDay]);

    const theme = period === "sunset" || period === "night" ? "dark" : "light";

    return (
      <SkylineFrameContext.Provider value={frame || sharedBackground}>
        <SkylinePeriodContext.Provider value={period}>
          <ComposerThemeContext.Provider value={active ? theme : undefined}>
            <div
              {...props}
              data-skyline-variant={variant}
              data-skyline-active={active}
              data-skyline-background={!sharedBackground}
              ref={(element) => {
                scene.current = element;
                if (typeof ref === "function") return ref(element);
                if (ref) ref.current = element;
              }}
              style={
                {
                  "--skyline-image": `url("${artwork[city][period]}")`,
                  ...style,
                } as CSSProperties
              }
              className={`skyline-scene ${frame ? "skyline-frame" : `${variant === "home" ? "home-page" : "chat-scene"} chat-main`} ${active ? theme : ""} ${className}`}
            >
              {!sharedBackground && (
                <SkylineBackground
                  city={city}
                  period={period}
                  pixelated={active && variant === "home"}
                />
              )}
              {children}
            </div>
          </ComposerThemeContext.Provider>
        </SkylinePeriodContext.Provider>
      </SkylineFrameContext.Provider>
    );
  },
);

function SkylineBackground({
  city,
  period,
  pixelated,
}: {
  city: SkylineCity;
  period: SkylinePeriod;
  pixelated: boolean;
}) {
  const image = useRef<HTMLImageElement>(null);
  const source = artwork[city][period];
  return (
    <div className="home-landscape" aria-hidden="true">
      <img
        ref={image}
        data-skyline-city={city}
        data-skyline-period={period}
        src={source}
        alt=""
        draggable={false}
        fetchPriority="high"
      />
      <SkylinePixels image={image} source={source} active={pixelated} />
    </div>
  );
}
