import { requireSupabase } from "../lib/supabase";
import type { CircleTheme, CreateEventInput, EventRSVP } from "./types";

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await requireSupabase().rpc(name, args);
  if (error) throw error;
  return data;
}

/** Real backend only; the demo provider never calls remote APIs. */
export const featureBackend = {
  createPoll: (
    circleId: string,
    question: string,
    options: string[],
    closesAt?: string,
  ) =>
    rpc("create_poll", {
      p_circle: circleId,
      p_question: question,
      p_options: options,
      p_closes_at: closesAt || null,
    }),
  vote: (pollId: string, optionId: string) =>
    rpc("cast_poll_vote", { p_poll: pollId, p_option: optionId }),
  closePoll: (pollId: string) => rpc("close_poll", { p_poll: pollId }),
  deletePoll: (pollId: string) => rpc("delete_poll", { p_poll: pollId }),
  createEvent: (input: CreateEventInput) =>
    rpc("create_event", {
      p_circle: input.circleId,
      p_title: input.title,
      p_description: input.description,
      p_location: input.location,
      p_starts_at: input.startsAt,
      p_ends_at: input.endsAt,
    }),
  deleteEvent: (eventId: string) => rpc("delete_event", { p_event: eventId }),
  rsvpEvent: (eventId: string, response: EventRSVP["response"]) =>
    rpc("set_event_rsvp", { p_event: eventId, p_response: response }),
  markCaughtUp: (circleId: string, seenAt?: string) =>
    rpc("mark_circle_caught_up", {
      p_circle: circleId,
      ...(seenAt ? { p_seen_at: seenAt } : {}),
    }),
  saveTheme: (circleId: string, theme: CircleTheme) =>
    rpc("save_circle_theme", { p_circle: circleId, p_theme: theme }),
  async generateTheme(circleId: string, prompt: string): Promise<CircleTheme> {
    const { data, error } = await requireSupabase().functions.invoke(
      "generate-circle-theme",
      { body: { circleId, prompt } },
    );
    if (error) {
      const response = "context" in error ? error.context : null;
      if (response instanceof Response) {
        const detail = await response.json().catch(() => null);
        if (detail?.error) throw new Error(detail.error);
      }
      throw new Error(
        "Theme generation is unavailable. Configure the generate-circle-theme Edge Function and server-side API key.",
      );
    }
    if (!data?.theme) throw new Error(data?.error || "No theme was generated.");
    return data.theme as CircleTheme;
  },
};
