import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState as NativeAppState } from "react-native";
import { supabase } from "../lib/supabase";
import { useCircle } from "../state/CircleProvider";
import type { Result } from "../types";
import type {
  CircleTheme,
  FeatureActions,
  FeatureContextValue,
  FeatureState,
  ThemeResult,
} from "./types";
import { canManageFeatures, emptyFeatures, visibleFeatures } from "./model";
import { validateTheme } from "./themes";
import { featureBackend } from "./backend";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key] ?? "");
const failure = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "Circle could not connect. Please try again.";

/** Actual Supabase data only. Failed authorization never falls back to samples. */
export function useRemoteFeatures(): FeatureContextValue {
  const base = useCircle(),
    current = useRef(base);
  current.current = base;
  const [raw, setRaw] = useState<FeatureState>(emptyFeatures),
    [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null);
  const generation = useRef(0),
    mounted = useRef(true),
    loadedFor = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    const userId = current.current.user?.id;
    const token = ++generation.current;
    if (!supabase || !userId) {
      loadedFor.current = null;
      setRaw(emptyFeatures());
      setReady(true);
      setError(null);
      return;
    }
    if (loadedFor.current !== userId) {
      loadedFor.current = userId;
      setRaw(emptyFeatures());
      setReady(false);
    }
    try {
      // A separate server membership check closes access even before the parent
      // provider learns that a membership was removed.
      const access = await supabase
        .from("circle_members")
        .select("circle_id")
        .eq("user_id", userId);
      if (access.error) throw access.error;
      const allowed = new Set(
        (access.data || []).map((row) => row.circle_id as string),
      );
      if (
        token !== generation.current ||
        !mounted.current ||
        current.current.user?.id !== userId
      )
        return;
      setRaw((previous) => ({
        ...previous,
        polls: previous.polls.filter((poll) => allowed.has(poll.circleId)),
        events: previous.events.filter((event) => allowed.has(event.circleId)),
        themes: Object.fromEntries(
          Object.entries(previous.themes).filter(([circleId]) =>
            allowed.has(circleId),
          ),
        ),
        readStates: previous.readStates.filter((read) =>
          allowed.has(read.circleId),
        ),
      }));
      if (!allowed.size) {
        setRaw(emptyFeatures());
        setError(null);
        return;
      }
      const read = async (table: string, column?: string): Promise<Row[]> => {
        const query = supabase!.from(table).select("*");
        const response = column
          ? await query.in(column, [...allowed])
          : await query;
        if (response.error) throw response.error;
        return (response.data || []) as Row[];
      };
      const [polls, options, votes, events, rsvps, themes, readStates] =
        await Promise.all([
          read("circle_polls", "circle_id"),
          read("poll_options"),
          read("poll_votes"),
          read("circle_events", "circle_id"),
          read("event_rsvps"),
          read("circle_themes", "circle_id"),
          read("circle_read_states", "circle_id"),
        ]);
      if (
        token !== generation.current ||
        !mounted.current ||
        current.current.user?.id !== userId
      )
        return;
      const visiblePolls = polls.filter((row) =>
          allowed.has(text(row, "circle_id")),
        ),
        visibleEvents = events.filter((row) =>
          allowed.has(text(row, "circle_id")),
        );
      const pollIds = new Set(visiblePolls.map((row) => text(row, "id"))),
        eventIds = new Set(visibleEvents.map((row) => text(row, "id")));
      const next: FeatureState = {
        version: 1,
        polls: visiblePolls.map((row) => ({
          id: text(row, "id"),
          circleId: text(row, "circle_id"),
          authorId: text(row, "author_id"),
          question: text(row, "question"),
          createdAt: text(row, "created_at"),
          closesAt: row.closes_at ? text(row, "closes_at") : undefined,
          closed: row.closed === true,
          options: options
            .filter((option) => option.poll_id === row.id)
            .sort((a, b) => Number(a.position) - Number(b.position))
            .map((option) => ({
              id: text(option, "id"),
              label: text(option, "label"),
            })),
        })),
        votes: votes
          .filter((row) => pollIds.has(text(row, "poll_id")))
          .map((row) => ({
            pollId: text(row, "poll_id"),
            userId: text(row, "user_id"),
            optionId: text(row, "option_id"),
          })),
        events: visibleEvents.map((row) => ({
          id: text(row, "id"),
          circleId: text(row, "circle_id"),
          authorId: text(row, "author_id"),
          title: text(row, "title"),
          description: text(row, "description"),
          location: text(row, "location"),
          startsAt: text(row, "starts_at"),
          endsAt: text(row, "ends_at"),
          createdAt: text(row, "created_at"),
        })),
        rsvps: rsvps
          .filter(
            (row) =>
              eventIds.has(text(row, "event_id")) &&
              ["going", "maybe", "not_going"].includes(text(row, "response")),
          )
          .map((row) => ({
            eventId: text(row, "event_id"),
            userId: text(row, "user_id"),
            response: text(row, "response") as "going" | "maybe" | "not_going",
          })),
        themes: Object.fromEntries(
          themes
            .filter(
              (row) =>
                allowed.has(text(row, "circle_id")) && validateTheme(row.theme),
            )
            .map((row) => [text(row, "circle_id"), row.theme as CircleTheme]),
        ),
        readStates: readStates
          .filter(
            (row) =>
              row.user_id === userId && allowed.has(text(row, "circle_id")),
          )
          .map((row) => ({
            circleId: text(row, "circle_id"),
            userId,
            seenAt: text(row, "seen_at"),
          })),
      };
      setRaw(visibleFeatures(next, current.current.state));
      setError(null);
    } catch (problem) {
      if (token === generation.current && mounted.current) {
        setRaw(emptyFeatures());
        setError(failure(problem));
      }
    } finally {
      if (token === generation.current && mounted.current) setReady(true);
    }
  }, []);
  const invalidate = useCallback(() => {
    ++generation.current;
  }, []);
  const userId = base.user?.id || null;
  const membershipKey = base.state.members
    .filter((member) => member.userId === userId)
    .map((member) => member.circleId)
    .sort()
    .join(",");
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 10_000);
    const foreground = NativeAppState.addEventListener("change", (state) => {
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
    const channel =
      supabase && userId
        ? supabase.channel(`circle-features:${userId}:${Date.now()}`)
        : null;
    if (channel) {
      for (const table of [
        "circle_polls",
        "poll_options",
        "poll_votes",
        "circle_events",
        "event_rsvps",
        "circle_themes",
        "circle_read_states",
        "circle_members",
      ])
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => {
            void refresh();
          },
        );
      channel.subscribe();
    }
    return () => {
      mounted.current = false;
      invalidate();
      clearInterval(interval);
      foreground.remove();
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", visibility);
      if (channel) void supabase!.removeChannel(channel);
    };
  }, [userId, membershipKey, refresh, invalidate]);
  const run = useCallback(
    async (work: () => Promise<unknown>): Promise<Result> => {
      const actor = current.current.user?.id;
      if (!actor) return { ok: false, error: "Sign in to continue." };
      try {
        const result = await work();
        if (current.current.user?.id !== actor)
          return {
            ok: false,
            error: "Your session changed. Please try again.",
          };
        await refresh();
        const item = result as { id?: string } | null;
        return { ok: true, ...(item?.id ? { id: item.id } : {}) };
      } catch (problem) {
        return { ok: false, error: failure(problem) };
      }
    },
    [refresh],
  );
  const actions = useMemo<FeatureActions>(
    () => ({
      createPoll: (circleId, question, options, closesAt) =>
        run(() =>
          featureBackend.createPoll(circleId, question, options, closesAt),
        ),
      vote: (pollId, optionId) =>
        run(() => featureBackend.vote(pollId, optionId)),
      closePoll: (pollId) => run(() => featureBackend.closePoll(pollId)),
      deletePoll: (pollId) => run(() => featureBackend.deletePoll(pollId)),
      createEvent: (input) => run(() => featureBackend.createEvent(input)),
      deleteEvent: (eventId) => run(() => featureBackend.deleteEvent(eventId)),
      rsvpEvent: (eventId, response) =>
        run(() => featureBackend.rsvpEvent(eventId, response)),
      markCaughtUp: (circleId, seenAt = new Date().toISOString()) =>
        run(() => featureBackend.markCaughtUp(circleId, seenAt)),
      saveTheme: (circleId, theme) =>
        run(() => featureBackend.saveTheme(circleId, theme)),
      generateTheme: async (circleId, prompt): Promise<ThemeResult> => {
        const actor = current.current.user?.id;
        if (!actor || !canManageFeatures(current.current.state, circleId))
          return {
            ok: false,
            error: "Only the owner or an admin can preview a Circle theme.",
          };
        try {
          const theme = await featureBackend.generateTheme(circleId, prompt);
          if (
            current.current.user?.id !== actor ||
            !canManageFeatures(current.current.state, circleId)
          )
            throw new Error("Your Circle access changed. Please try again.");
          if (!validateTheme(theme))
            throw new Error(
              "The generated theme was invalid. Please try again.",
            );
          return { ok: true, theme };
        } catch (problem) {
          return { ok: false, error: failure(problem) };
        }
      },
    }),
    [run],
  );
  // Identity and membership filtering happens before effects, closing the render
  // between a parent revocation/auth change and this hook’s next network request.
  const safe =
    loadedFor.current === userId
      ? visibleFeatures(raw, base.state)
      : emptyFeatures();
  return { ...safe, ready: ready && base.ready, error, actions };
}
