import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { invokeCircle } from "../lib/appwrite";
import { useCircle } from "../state/CircleProvider";
import { useCircleFeatures } from "./CircleFeaturesProvider";
import { wallpaperCircleId } from "./themes";
import type { CircleTheme } from "./types";

interface WallpaperState {
  scope: string;
  uri?: string;
  expiresAt?: number;
  loading: boolean;
  error: string | null;
}

/** Resolve only current members' private wallpapers; signed URLs are never saved. */
export function useThemeWallpaper(theme?: CircleTheme): {
  uri: string | undefined;
  loading: boolean;
  error: string | null;
} {
  const base = useCircle();
  const features = useCircleFeatures();
  const path = theme?.wallpaperPath;
  const circleId = wallpaperCircleId(path);
  const userId = base.user?.id;
  const member = base.state.members.find(
    (item) => item.userId === userId && item.circleId === circleId,
  );
  const isSaved = Boolean(
    circleId && features.themes[circleId]?.wallpaperPath === path,
  );
  const isManager = member?.role === "owner" || member?.role === "admin";
  const allowed = Boolean(
    base.ready &&
    base.mode === "appwrite" &&
    userId &&
    base.state.users.some((user) => user.id === userId) &&
    circleId &&
    member &&
    (isSaved || isManager),
  );
  const scope = allowed
    ? `${userId}:${circleId}:${member!.role}:${isSaved}:${path}`
    : "";
  const [resolved, setResolved] = useState<WallpaperState>({
    scope: "",
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!scope || !path) {
      setResolved({ scope: "", loading: false, error: null });
      return;
    }
    let alive = true;
    let sequence = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setResolved({ scope, loading: true, error: null });
    const refresh = async () => {
      const request = ++sequence;
      if (timer) clearTimeout(timer);
      try {
        const data = await invokeCircle<{ url: string; expiresAt: number }>({
          kind: "themeWallpaper",
          wallpaperPath: path,
        });
        if (!alive || request !== sequence) return;
        const configured = process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT;
        const imageUrl = new URL(data.url);
        if (
          !configured ||
          imageUrl.protocol !== "https:" ||
          imageUrl.origin !== new URL(configured).origin ||
          !/\/storage\/buckets\/circle-wallpapers\/files\/[0-9a-f-]{36}\/view$/i.test(
            imageUrl.pathname,
          ) ||
          !Number.isFinite(data.expiresAt) ||
          data.expiresAt <= Date.now()
        )
          throw new Error(
            "The wallpaper could not be loaded. Please try again.",
          );
        setResolved({
          scope,
          uri: data.url,
          expiresAt: Math.min(data.expiresAt, Date.now() + 60_000),
          loading: false,
          error: null,
        });
        timer = setTimeout(
          () => void refresh(),
          Math.max(
            1_000,
            Math.min(45_000, data.expiresAt - Date.now() - 15_000),
          ),
        );
      } catch {
        if (!alive || request !== sequence) return;
        // Clear old URLs on any authorization or network failure. The Function
        // remains authoritative while the parent membership state refreshes.
        setResolved({
          scope,
          loading: false,
          error: "The wallpaper could not be loaded. Please try again.",
        });
        timer = setTimeout(() => void refresh(), 15_000);
      }
    };
    void refresh();
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    const visibility = () => {
      if (
        typeof document === "undefined" ||
        document.visibilityState === "visible"
      )
        void refresh();
    };
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", visibility);
    return () => {
      alive = false;
      ++sequence;
      if (timer) clearTimeout(timer);
      foreground.remove();
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", visibility);
    };
  }, [scope, path]);

  // Filter during render: no old Circle image survives the render preceding
  // an effect cleanup after sign-out, role loss, or a Circle/theme change.
  const current = Boolean(scope && resolved.scope === scope);
  return {
    uri:
      current && resolved.expiresAt && resolved.expiresAt > Date.now()
        ? resolved.uri
        : undefined,
    loading: current ? resolved.loading : allowed,
    error: current ? resolved.error : null,
  };
}
