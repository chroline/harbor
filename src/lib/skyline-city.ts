export type SkylineCity = "sf" | "la" | "nyc";

export const skylineCities: { value: SkylineCity; label: string }[] = [
  { value: "sf", label: "San Francisco" },
  { value: "la", label: "Los Angeles" },
  { value: "nyc", label: "New York City" },
];

/** Existing installs and unrecognized saved values retain San Francisco. */
export function skylineCity(value: unknown): SkylineCity {
  return value === "la" || value === "nyc" ? value : "sf";
}
