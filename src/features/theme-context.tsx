import React, { createContext, useContext } from "react";
import type { CircleTheme } from "./types";
import { defaultTheme } from "./themes";

const CircleThemeContext = createContext<CircleTheme>(defaultTheme);

export function CircleThemeProvider({
  theme,
  children,
}: {
  theme: CircleTheme;
  children: React.ReactNode;
}) {
  return (
    <CircleThemeContext.Provider value={theme}>
      {children}
    </CircleThemeContext.Provider>
  );
}

/** Default palette outside an approved Circle, including the combined Home feed. */
export function useCircleTheme() {
  return useContext(CircleThemeContext);
}

export function themeTint(color: string, opacity = 0.08) {
  const amount = Math.max(0, Math.min(1, opacity));
  const channel = (start: number) =>
    Math.round(
      parseInt(color.slice(start, start + 2), 16) * amount + 255 * (1 - amount),
    );
  return `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`;
}
