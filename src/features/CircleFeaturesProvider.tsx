import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCircle } from "../state/CircleProvider";
import type { Result } from "../types";
import type {
  FeatureActions,
  FeatureContextValue,
  FeatureState,
  ThemeResult,
} from "./types";
import {
  canManageFeatures,
  emptyFeatures,
  pruneFeatures,
  transitionFeatures,
  visibleFeatures,
} from "./model";
import type { FeatureAction } from "./model";
import { createFeatureSeed } from "./seed";
import { THEME_PROMPT_MAX_LENGTH } from "./themes";
import { useRemoteFeatures } from "./remote";
const KEY = "circle.features.v1";
const FeatureContext = createContext<FeatureContextValue | null>(null);

function readSaved(raw: string): FeatureState {
  const saved: unknown = JSON.parse(raw);
  if (!saved || typeof saved !== "object")
    throw new Error("Invalid saved features.");
  const data = saved as Partial<FeatureState>;
  if (
    data.version !== 1 ||
    !["polls", "votes", "events", "rsvps", "readStates"].every((key) =>
      Array.isArray(data[key as keyof FeatureState]),
    ) ||
    !data.themes ||
    typeof data.themes !== "object" ||
    Array.isArray(data.themes)
  )
    throw new Error("Invalid saved features.");
  return data as FeatureState;
}
function useDemoFeatures(): FeatureContextValue {
  const base = useCircle(),
    appRef = useRef(base.state);
  appRef.current = base.state;
  const [raw, setRaw] = useState<FeatureState>(emptyFeatures),
    [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null);
  const ref = useRef(raw),
    writes = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!base.ready) return;
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then(async (value) => {
        const next = value
          ? pruneFeatures(readSaved(value), appRef.current)
          : createFeatureSeed(appRef.current);
        if (!value) await AsyncStorage.setItem(KEY, JSON.stringify(next));
        if (alive) {
          ref.current = next;
          setRaw(next);
        }
      })
      .catch(() => {
        if (alive)
          setError(
            "Your local Circle features could not be loaded. Free some device storage and try again.",
          );
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [base.ready]);
  const dispatch = useCallback((action: FeatureAction): Promise<Result> => {
    const task = writes.current.then(async () => {
      const clean = pruneFeatures(ref.current, appRef.current);
      const result = transitionFeatures(clean, appRef.current, action);
      if (!result.result.ok) return result.result;
      await AsyncStorage.setItem(KEY, JSON.stringify(result.state));
      ref.current = result.state;
      setRaw(result.state);
      setError(null);
      return result.result;
    });
    writes.current = task.then(
      () => undefined,
      () => undefined,
    );
    return task.catch(() => ({
      ok: false,
      error:
        "This device could not save your changes. Free some local storage and try again.",
    }));
  }, []);
  // Account deletion removes its owned circles and contributions from the local
  // feature store. Membership filtering below happens synchronously on render.
  const existence = `${base.state.users
    .map((user) => user.id)
    .sort()
    .join(",")}|${base.state.circles
    .map((circle) => circle.id)
    .sort()
    .join(",")}`;
  useEffect(() => {
    if (!ready) return;
    const task = writes.current.then(async () => {
      const next = pruneFeatures(ref.current, appRef.current);
      if (JSON.stringify(next) === JSON.stringify(ref.current)) return;
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
      ref.current = next;
      setRaw(next);
    });
    writes.current = task.catch(() => {
      setError("This device could not finish removing deleted Circle data.");
    });
  }, [existence, ready]);
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
      generateTheme: async (circleId, prompt): Promise<ThemeResult> => {
        if (!canManageFeatures(appRef.current, circleId))
          return {
            ok: false,
            error: "Only the owner or an admin can preview a Circle theme.",
          };
        if (prompt.trim().length < 3 || prompt.length > THEME_PROMPT_MAX_LENGTH)
          return {
            ok: false,
            error: "Describe your wallpaper in 3–1,000 characters.",
          };
        return {
          ok: false,
          error:
            "AI wallpaper generation needs a connected backend and a server-side OpenAI API key. Local Demo keeps your current theme unchanged.",
        };
      },
    }),
    [dispatch],
  );
  const visible = useMemo(
    () => visibleFeatures(pruneFeatures(raw, base.state), base.state),
    [raw, base.state],
  );
  return { ...visible, ready: ready && base.ready, error, actions };
}
function DemoFeatures({ children }: { children: ReactNode }) {
  return (
    <FeatureContext.Provider value={useDemoFeatures()}>
      {children}
    </FeatureContext.Provider>
  );
}
function RemoteFeatures({ children }: { children: ReactNode }) {
  return (
    <FeatureContext.Provider value={useRemoteFeatures()}>
      {children}
    </FeatureContext.Provider>
  );
}
export function CircleFeaturesProvider({ children }: { children: ReactNode }) {
  const { mode } = useCircle();
  return mode === "appwrite" ? (
    <RemoteFeatures>{children}</RemoteFeatures>
  ) : (
    <DemoFeatures>{children}</DemoFeatures>
  );
}
export function useCircleFeatures() {
  const context = useContext(FeatureContext);
  if (!context)
    throw new Error(
      "useCircleFeatures must be used within CircleFeaturesProvider.",
    );
  return context;
}
