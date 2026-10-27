import { createContext, useContext } from "react";

/** Keep portaled composer menus in the theme of their originating scene. */
export const ComposerThemeContext = createContext<"light" | "dark" | undefined>(
  undefined,
);

export function useComposerTheme() {
  return useContext(ComposerThemeContext);
}
