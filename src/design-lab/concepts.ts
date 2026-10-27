import sfDawn from "../assets/artwork/sf/dawn.webp";
import sfDay from "../assets/artwork/sf/day.webp";
import sfSunset from "../assets/artwork/sf/sunset.webp";
import sfNight from "../assets/artwork/sf/night.webp";
import laDawn from "../assets/artwork/la/dawn.webp";
import laDay from "../assets/artwork/la/day.webp";
import laSunset from "../assets/artwork/la/sunset.webp";
import laNight from "../assets/artwork/la/night.webp";
import nycDawn from "../assets/artwork/nyc/dawn.webp";
import nycDay from "../assets/artwork/nyc/day.webp";
import nycSunset from "../assets/artwork/nyc/sunset.webp";
import nycNight from "../assets/artwork/nyc/night.webp";

export const artwork = {
  sf: { dawn: sfDawn, day: sfDay, sunset: sfSunset, night: sfNight },
  la: { dawn: laDawn, day: laDay, sunset: laSunset, night: laNight },
  nyc: { dawn: nycDawn, day: nycDay, sunset: nycSunset, night: nycNight },
};
export type City = keyof typeof artwork;
export type Period = keyof typeof artwork.sf;

export const concepts = [
  {
    id: "tide",
    name: "Light tide",
    category: "Atmospheric",
    accent: "#e9b67f",
    description:
      "Wide pools of warm and cool light drift across the original scene.",
    detail:
      "The gentlest direction. The image stays intact while diffuse light moves slowly through it, like a reflection on a wall.",
    motion: "Slow, continuous washes",
    texture: "Soft / photographic",
  },
  {
    id: "weave",
    name: "Woven light",
    category: "Textile",
    accent: "#b4c896",
    description: "One broad pool of warm light awakens a fine field of circular dots.",
    detail:
      "A warm pool drifts over sharp, fixed dots and a blurred copy of the same image. Its falloff radius is doubled without extra brightness. At the saved 40% intensity, dot sizes range from 20–70%, proportional to distance from the pool. The intensity slider changes the minimum size; the maximum stays at 70%.",
    motion: "Drifting light / fixed dots",
    texture: "Dotted / rhythmic",
  },
  {
    id: "glass",
    name: "Liquid glass",
    category: "Refractive",
    accent: "#9fc6dc",
    description:
      "Translucent glass ribbons gently bend the skyline behind them.",
    detail:
      "Broad vertical panes refract different slices of the image. Their edges catch light as they breathe in and out, like looking through sculpted glass.",
    motion: "Slow optical distortion",
    texture: "Smooth / dimensional",
  },
  {
    id: "contour",
    name: "Contour field",
    category: "Topographic",
    accent: "#a8d7c6",
    description: "Flowing contour lines turn the landscape into a living map.",
    detail:
      "The image becomes terrain. Fine lines lift around the bright architecture and drift in long waves, retaining a hint of the skyline underneath.",
    motion: "Continuous line flow",
    texture: "Linear / abstract",
  },
  {
    id: "dither",
    name: "Dither bloom",
    category: "Generative",
    accent: "#e9b6b9",
    description:
      "A limited palette redraws the scene in softly changing color fields.",
    detail:
      "An ordered dither pattern replaces the image with ink-like dots. Large color blooms change which marks appear, so the scene feels gently regenerated.",
    motion: "Evolving color fields",
    texture: "Grainy / graphic",
  },
  {
    id: "echo",
    name: "Chromatic echo",
    category: "Optical",
    accent: "#bcb1ea",
    description:
      "Color channels separate and settle into a dreamy, analog image.",
    detail:
      "Red, green, and blue copies of the same scene breathe slightly out of alignment. Colored edges emerge around the skyline and dissolve back together.",
    motion: "Breathing color offsets",
    texture: "Filmic / spectral",
  },
] as const;

export type Concept = (typeof concepts)[number];
export type ConceptId = Concept["id"];
