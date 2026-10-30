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
} from "./types";
import type { FeatureAction } from "./model";
import { emptyFeatures, visibleFeatures } from "./model";

export function useRemoteFeatures(): FeatureContextValue {
  const base = useCircle(),
    current = useRef(base);
  current.current = base;
  const [raw, setRaw] = useState<FeatureState>(emptyFeatures);
  const [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null);
  const generation = useRef(0),
    mounted = useRef(true),
    loadedFor = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    const actor = current.current.user?.id,
      token = ++generation.current;
    if (!actor) {
      setRaw(emptyFeatures());
      loadedFor.current = null;
      setReady(true);
      return;
    }
    try {
      const data = await invokeCircle<FeatureState>({ kind: "features" });
      if (
        mounted.current &&
        generation.current === token &&
        current.current.user?.id === actor
      ) {
        loadedFor.current = actor;
        setRaw(data);
        setError(null);
      }
    } catch (cause) {
      if (mounted.current && generation.current === token) {
        setRaw(emptyFeatures());
        setError(
          cause instanceof Error ? cause.message : "Features unavailable.",
        );
      }
    } finally {
      if (mounted.current && generation.current === token) setReady(true);
    }
  }, []);
  const userId = base.user?.id;
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 10_000);
    const foreground = NativeAppState.addEventListener("change", (value) => {
      if (value === "active") void refresh();
    });
    return () => {
      mounted.current = false;
      // Invalidate asynchronous requests; this ref is a counter, not a DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++generation.current;
      clearInterval(timer);
      foreground.remove();
    };
  }, [userId, refresh]);
  const dispatch = useCallback(
    async (action: FeatureAction): Promise<Result> => {
      const actor = current.current.user?.id;
      if (!actor) return { ok: false, error: "Sign in to continue." };
      try {
        const result = await invokeCircle<Result>({
          kind: "featureAction",
          action,
        });
        if (current.current.user?.id !== actor)
          return { ok: false, error: "Your session changed." };
        await refresh();
        return result;
      } catch (cause) {
        await refresh();
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
      generateTheme: async (circleId, prompt) => {
        const actor = current.current.user?.id;
        try {
          const theme = await invokeCircle<CircleTheme>({
            kind: "generateTheme",
            circleId,
            prompt,
          });
          if (actor !== current.current.user?.id)
            throw new Error("Your session changed.");
          return { ok: true, theme };
        } catch (cause) {
          return {
            ok: false,
            error:
              cause instanceof Error
                ? cause.message
                : "Theme generation failed.",
          };
        }
      },
    }),
    [dispatch],
  );
  const safe =
    loadedFor.current === userId
      ? visibleFeatures(raw, base.state)
      : emptyFeatures();
  return { ...safe, ready: ready && base.ready, error, actions };
}
