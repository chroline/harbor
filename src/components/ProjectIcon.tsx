import { rem } from "@/lib/units";
import {
  Folder,
  Code,
  Terminal,
  Rocket,
  Globe,
  BookOpen,
  Lightbulb,
  FlaskConical,
  Layers,
  Wrench,
  Star,
  Heart,
} from "@/lib/icons";
import type { Project } from "../lib/bindings/Project";
import type { IconComponent } from "../lib/icon-context";
export const projectIcons = {
  folder: Folder,
  code: Code,
  terminal: Terminal,
  rocket: Rocket,
  globe: Globe,
  "book-open": BookOpen,
  lightbulb: Lightbulb,
  "flask-conical": FlaskConical,
  layers: Layers,
  wrench: Wrench,
  star: Star,
  heart: Heart,
};
export const projectColors = [
  "gray",
  "blue",
  "green",
  "teal",
  "purple",
  "pink",
  "orange",
  "red",
] as const;
export function ProjectIcon({
  project,
  size = 18,
  className = "",
}: {
  project: Pick<Project, "icon" | "color">;
  size?: number | string;
  className?: string;
}) {
  const Icon =
    projectIcons[project.icon as keyof typeof projectIcons] ?? Folder;
  const color = projectColors.includes(
    project.color as (typeof projectColors)[number],
  )
    ? project.color
    : "gray";
  return (
    <span
      className={`project-icon project-color-${color} ${className}`}
      aria-hidden="true"
    >
      <Icon size={rem(size)} />
    </span>
  );
}
const glyphs = new Map<string, IconComponent>();
export function projectGlyph(
  project: Pick<Project, "icon" | "color">,
): IconComponent {
  const key = `${project.icon}:${project.color}`;
  if (!glyphs.has(key))
    glyphs.set(key, ({ size = 18, className }) => (
      <ProjectIcon project={project} size={rem(size)} className={className} />
    ));
  return glyphs.get(key)!;
}
