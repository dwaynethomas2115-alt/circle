import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState as NativeAppState } from "react-native";
import { invokeCircle } from "../lib/appwrite";
import { useCircle } from "../state/CircleProvider";
import type { Result } from "../types";
import type {
  FeatureActions,
  FeatureContextValue,
  FeatureState,
  CircleTheme,
  ThemeResult,
} from "./types";
import type { FeatureAction } from "./model";
import { canManageFeatures, emptyFeatures, visibleFeatures } from "./model";
import {
  THEME_PROMPT_MAX_LENGTH,
  validateGeneratedWallpaper,
  validateTheme,
} from "./themes";
import { ThemeGenerationError } from "./theme-errors";
import { createScopedRefresh } from "../lib/scopedRefresh";

export function useRemoteFeatures(): FeatureContextValue {
  const base = useCircle(),
    current = useRef(base);
  current.current = base;
  const [raw, setRaw] = useState<FeatureState>(emptyFeatures);
  const [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);
  const userId = base.user?.id;
  const membershipKey = base.state.members
    .filter((member) => member.userId === userId)
    .map((member) => `${member.circleId}:${member.role}`)
    .sort()
    .join(",");
  const accessScope =
    base.authStatus !== "unknown" && userId
      ? JSON.stringify([userId, membershipKey])
      : null;
  const scopeRef = useRef(accessScope);
  scopeRef.current = accessScope;
  const coordinator = useRef<ReturnType<
    typeof createScopedRefresh<FeatureState>
  > | null>(null);
  if (!coordinator.current)
    coordinator.current = createScopedRefresh({
      scope: () => scopeRef.current,
      load: () => invokeCircle<FeatureState>({ kind: "features" }),
      accept: (data, scope) => {
        loadedFor.current = scope;
        setRaw({
          ...data,
          themes: Object.fromEntries(
            Object.entries(data.themes).filter(([, theme]) =>
              validateTheme(theme),
            ),
          ),
        });
        setError(null);
        setReady(true);
      },
      reject: (cause) => {
        loadedFor.current = null;
        setRaw(emptyFeatures());
        setError(
          cause instanceof Error ? cause.message : "Features unavailable.",
        );
        setReady(true);
      },
      clear: () => {
        loadedFor.current = null;
        setRaw(emptyFeatures());
        setError(null);
        setReady(true);
      },
    });
  const refresh = useCallback(
    (fresh = false) => coordinator.current!.refresh(fresh),
    [],
  );
  useEffect(() => {
    coordinator.current!.setActive(true);
    void refresh();
    const timer = setInterval(() => {
      const visible =
        typeof document !== "undefined"
          ? document.visibilityState === "visible"
          : NativeAppState.currentState === "active";
      if (visible) void refresh();
    }, 10_000);
    // React Native Web already translates visibilitychange into AppState.
    // Listen to one foreground source so one return starts one fresh read.
    const foreground =
      typeof document === "undefined"
        ? NativeAppState.addEventListener("change", (value) => {
            if (value === "active") void refresh(true);
          })
        : undefined;
    const visible = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", visible);
    return () => {
      coordinator.current!.setActive(false);
      clearInterval(timer);
      foreground?.remove();
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", visible);
    };
  }, [accessScope, refresh]);
  const dispatch = useCallback(
    async (action: FeatureAction): Promise<Result> => {
      const actor = current.current.user?.id;
      if (current.current.authStatus === "unknown")
        return {
          ok: false,
          error: "Reconnect to Circle before making changes.",
        };
      if (!actor) return { ok: false, error: "Sign in to continue." };
      try {
        const result = await invokeCircle<Result>({
          kind: "featureAction",
          action,
        });
        const latest = current.current;
        if (latest.authStatus === "unknown" || latest.user?.id !== actor)
          return { ok: false, error: "Your session changed." };
        await refresh(true);
        return result;
      } catch (cause) {
        await refresh(true);
        return {
          ok: false,
          error:
            cause instanceof Error ? cause.message : "The operation failed.",
        };
      }
    },
    [refresh],
  );
  const actions = useMemo<FeatureActions>(
    () => ({
      refresh: async () => {
        await refresh(true);
      },
      createPoll: (circleId, question, options, closesAt) =>
        dispatch({ type: "createPoll", circleId, question, options, closesAt }),
      vote: (pollId, optionId) => dispatch({ type: "vote", pollId, optionId }),
      closePoll: (pollId) => dispatch({ type: "closePoll", pollId }),
      deletePoll: (pollId) => dispatch({ type: "deletePoll", pollId }),
      createEvent: (input) => dispatch({ type: "createEvent", input }),
      deleteEvent: (eventId) => dispatch({ type: "deleteEvent", eventId }),
      rsvpEvent: (eventId, response) =>
        dispatch({ type: "rsvpEvent", eventId, response }),
      markCaughtUp: (circleId, seenAt = new Date().toISOString()) =>
        dispatch({ type: "markCaughtUp", circleId, seenAt }),
      saveTheme: (circleId, theme) =>
        dispatch({ type: "saveTheme", circleId, theme }),
      generateTheme: async (circleId, prompt): Promise<ThemeResult> => {
        const actor = current.current.user?.id;
        if (
          current.current.authStatus === "unknown" ||
          !actor ||
          !canManageFeatures(current.current.state, circleId)
        )
          return {
            ok: false,
            error: "Only the owner or an admin can preview a Circle theme.",
          };
        if (prompt.trim().length < 3 || prompt.length > THEME_PROMPT_MAX_LENGTH)
          return {
            ok: false,
            error: "Describe your wallpaper in 3–1,000 characters.",
          };
        try {
          const theme = await invokeCircle<CircleTheme>({
            kind: "generateTheme",
            circleId,
            prompt,
          });
          const latest = current.current;
          if (
            latest.authStatus === "unknown" ||
            actor !== latest.user?.id ||
            !canManageFeatures(latest.state, circleId)
          )
            throw new Error("Your Circle access changed. Please try again.");
          if (!validateGeneratedWallpaper(theme, circleId))
            throw new Error(
              "Your theme server needs the wallpaper update. Deploy the latest Circle Appwrite Function, then try again. Your current theme is unchanged.",
            );
          return { ok: true, theme };
        } catch (cause) {
          return {
            ok: false,
            error:
              cause instanceof Error
                ? cause.message
                : "Theme generation failed.",
            ...(cause instanceof ThemeGenerationError
              ? {
                  code: cause.code,
                  retryAfterSeconds: cause.retryAfterSeconds,
                  resetAt: cause.resetAt,
                }
              : {}),
          };
        }
      },
    }),
    [dispatch, refresh],
  );
  const safe =
    !!accessScope && loadedFor.current === accessScope
      ? visibleFeatures(raw, base.state)
      : emptyFeatures();
  return { ...safe, ready: ready && base.ready, error, actions };
}
