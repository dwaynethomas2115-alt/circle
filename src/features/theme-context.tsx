import React, { createContext, useContext } from "react";
import type { CircleTheme } from "./types";
import { defaultTheme } from "./themes";
import { useThemeWallpaper } from "./useThemeWallpaper";

const CircleThemeContext = createContext<CircleTheme>(defaultTheme);
const CircleWallpaperContext = createContext<
  ReturnType<typeof useThemeWallpaper>
>({
  uri: undefined,
  loading: false,
  error: null,
});

export function CircleThemeProvider({
  theme,
  children,
}: {
  theme: CircleTheme;
  children: React.ReactNode;
}) {
  const wallpaper = useThemeWallpaper(theme);
  return (
    <CircleThemeContext.Provider value={theme}>
      <CircleWallpaperContext.Provider value={wallpaper}>
        {children}
      </CircleWallpaperContext.Provider>
    </CircleThemeContext.Provider>
  );
}

/** Default palette outside an approved Circle, including the combined Home feed. */
export function useCircleTheme() {
  return useContext(CircleThemeContext);
}

/** One private image resolution is shared by all decorations in this scope. */
export function useCircleWallpaper() {
  return useContext(CircleWallpaperContext);
}

export function themeTint(color: string, opacity = 0.08) {
  const amount = Math.max(0, Math.min(1, opacity));
  const channel = (start: number) =>
    Math.round(
      parseInt(color.slice(start, start + 2), 16) * amount + 255 * (1 - amount),
    );
  return `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`;
}
