const BASE_FONT_SIZE = 16;

/** Design dimensions expressed relative to the browser's default font size. */
export function rem(value: number | string): string {
  return typeof value === "string" ? value : `${value / BASE_FONT_SIZE}rem`;
}

export function rootFontSize(): number {
  if (typeof document === "undefined") return BASE_FONT_SIZE;
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || BASE_FONT_SIZE;
}

/** DOM measurements stay in browser coordinates; convert at the CSS boundary. */
export function pixelsToRem(value: number): string {
  return `${value / rootFontSize()}rem`;
}

/** Resolve a CSS length for pointer arithmetic and APIs that require numbers. */
export function cssLengthToPixels(value: string): number {
  const length = Number.parseFloat(value);
  return value.endsWith("rem") ? length * rootFontSize() : length;
}

export function scaledSize(value: number): number {
  return value * rootFontSize() / BASE_FONT_SIZE;
}
