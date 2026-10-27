export type SkylinePeriod = "dawn" | "day" | "sunset" | "night";
export type SkylineTimeOfDay = "automatic" | SkylinePeriod;

export const skylineTimesOfDay: { value: SkylineTimeOfDay; label: string }[] = [
  { value: "automatic", label: "Automatic" },
  { value: "dawn", label: "Dawn" },
  { value: "day", label: "Day" },
  { value: "sunset", label: "Sunset" },
  { value: "night", label: "Night" },
];

export function skylineTimeOfDay(value: unknown): SkylineTimeOfDay {
  return value === "dawn" ||
    value === "day" ||
    value === "sunset" ||
    value === "night"
    ? value
    : "automatic";
}

/** Follow the user's local clock, independently of the interface theme. */
export function skylinePeriod(date = new Date()): SkylinePeriod {
  const hour = date.getHours();
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "sunset";
  return "night";
}
