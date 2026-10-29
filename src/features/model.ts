import type { AppState, Result } from "../types";
import type {
  CircleTheme,
  CreateEventInput,
  EventRSVP,
  FeatureState,
} from "./types";
import { validateTheme } from "./themes";
import { isBlocked } from "../state/model";

export type FeatureAction =
  | {
      type: "createPoll";
      circleId: string;
      question: string;
      options: string[];
      closesAt?: string;
    }
  | { type: "vote"; pollId: string; optionId: string }
  | { type: "closePoll"; pollId: string }
  | { type: "deletePoll"; pollId: string }
  | { type: "createEvent"; input: CreateEventInput }
  | { type: "deleteEvent"; eventId: string }
  | { type: "rsvpEvent"; eventId: string; response: EventRSVP["response"] }
  | { type: "markCaughtUp"; circleId: string; seenAt: string }
  | { type: "saveTheme"; circleId: string; theme: CircleTheme };

export function emptyFeatures(): FeatureState {
  return {
    version: 1,
    polls: [],
    votes: [],
    events: [],
    rsvps: [],
    themes: {},
    readStates: [],
  };
}
export function featureMember(app: AppState, circleId: string) {
  return app.currentUserId &&
    app.users.some((user) => user.id === app.currentUserId)
    ? app.members.find(
        (member) =>
          member.userId === app.currentUserId && member.circleId === circleId,
      )
    : undefined;
}
export function canManageFeatures(app: AppState, circleId: string): boolean {
  return ["owner", "admin"].includes(featureMember(app, circleId)?.role || "");
}
/** Applied on every render, including the first render after revocation/sign-out. */
export function visibleFeatures(
  state: FeatureState,
  app: AppState,
): FeatureState {
  const circles = new Set(
    app.members
      .filter((member) => member.userId === app.currentUserId)
      .map((member) => member.circleId),
  );
  if (
    !app.currentUserId ||
    !app.users.some((user) => user.id === app.currentUserId)
  )
    return emptyFeatures();
  const polls = state.polls.filter(
    (poll) => circles.has(poll.circleId) && !isBlocked(app, poll.authorId),
  );
  const events = state.events.filter(
    (event) => circles.has(event.circleId) && !isBlocked(app, event.authorId),
  );
  const pollIds = new Set(polls.map((poll) => poll.id)),
    eventIds = new Set(events.map((event) => event.id));
  return {
    version: 1,
    polls,
    events,
    votes: state.votes.filter(
      (vote) => pollIds.has(vote.pollId) && !isBlocked(app, vote.userId),
    ),
    rsvps: state.rsvps.filter(
      (rsvp) => eventIds.has(rsvp.eventId) && !isBlocked(app, rsvp.userId),
    ),
    themes: Object.fromEntries(
      Object.entries(state.themes).filter(([circleId]) =>
        circles.has(circleId),
      ),
    ),
    readStates: state.readStates.filter(
      (read) => circles.has(read.circleId) && read.userId === app.currentUserId,
    ),
  };
}
/** The local demo mirrors deletion cascades, while retaining other demo accounts. */
export function pruneFeatures(
  state: FeatureState,
  app: AppState,
): FeatureState {
  const users = new Set(app.users.map((user) => user.id)),
    circles = new Set(app.circles.map((circle) => circle.id));
  const polls = state.polls.filter(
    (poll) => circles.has(poll.circleId) && users.has(poll.authorId),
  );
  const events = state.events.filter(
    (event) => circles.has(event.circleId) && users.has(event.authorId),
  );
  const pollIds = new Set(polls.map((poll) => poll.id)),
    eventIds = new Set(events.map((event) => event.id));
  return {
    version: 1,
    polls,
    events,
    votes: state.votes.filter(
      (vote) => pollIds.has(vote.pollId) && users.has(vote.userId),
    ),
    rsvps: state.rsvps.filter(
      (rsvp) => eventIds.has(rsvp.eventId) && users.has(rsvp.userId),
    ),
    themes: Object.fromEntries(
      Object.entries(state.themes).filter(([circleId]) =>
        circles.has(circleId),
      ),
    ),
    readStates: state.readStates.filter(
      (read) =>
        circles.has(read.circleId) &&
        users.has(read.userId) &&
        app.members.some(
          (member) =>
            member.circleId === read.circleId && member.userId === read.userId,
        ),
    ),
  };
}
const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export function transitionFeatures(
  previous: FeatureState,
  app: AppState,
  action: FeatureAction,
  now = Date.now(),
): { state: FeatureState; result: Result } {
  const fail = (error: string) => ({
    state: previous,
    result: { ok: false, error },
  });
  const actor = app.currentUserId;
  if (!actor || !app.users.some((user) => user.id === actor))
    return fail("Sign in to continue.");
  const state: FeatureState = JSON.parse(JSON.stringify(previous));
  const success = (id?: string) => ({
    state,
    result: { ok: true, ...(id ? { id } : {}) },
  });
  const member = (circleId: string) => Boolean(featureMember(app, circleId));
  const manager = (circleId: string, authorId?: string) =>
    authorId === actor || canManageFeatures(app, circleId);
  switch (action.type) {
    case "createPoll": {
      if (!member(action.circleId))
        return fail("Only Circle members can create a poll.");
      const question = action.question.trim(),
        labels = action.options.map((option) => option.trim());
      if (question.length < 3 || question.length > 240)
        return fail("Write a poll question between 3 and 240 characters.");
      if (
        labels.length < 2 ||
        labels.length > 6 ||
        labels.some((label) => !label || label.length > 100)
      )
        return fail("Add 2–6 options, each between 1 and 100 characters.");
      if (
        new Set(labels.map((label) => label.toLocaleLowerCase())).size !==
        labels.length
      )
        return fail("Each poll option must be different.");
      if (
        action.closesAt &&
        (!Number.isFinite(Date.parse(action.closesAt)) ||
          Date.parse(action.closesAt) <= now)
      )
        return fail("Choose a closing time in the future.");
      const id = uid("poll");
      state.polls.unshift({
        id,
        circleId: action.circleId,
        authorId: actor,
        question,
        options: labels.map((label) => ({ id: uid("option"), label })),
        createdAt: new Date(now).toISOString(),
        closesAt: action.closesAt,
        closed: false,
      });
      return success(id);
    }
    case "vote": {
      const poll = state.polls.find((item) => item.id === action.pollId);
      if (!poll || !member(poll.circleId) || isBlocked(app, poll.authorId))
        return fail("This poll is not available to you.");
      if (poll.closed || (poll.closesAt && Date.parse(poll.closesAt) <= now))
        return fail("This poll has closed.");
      if (!poll.options.some((option) => option.id === action.optionId))
        return fail("Choose an option from this poll.");
      state.votes = state.votes.filter(
        (vote) => !(vote.pollId === poll.id && vote.userId === actor),
      );
      state.votes.push({
        pollId: poll.id,
        userId: actor,
        optionId: action.optionId,
      });
      return success();
    }
    case "closePoll":
    case "deletePoll": {
      const poll = state.polls.find((item) => item.id === action.pollId);
      if (!poll || !member(poll.circleId))
        return fail("This poll is not available to you.");
      if (!manager(poll.circleId, poll.authorId))
        return fail(
          "Only the author, owner, or an admin can manage this poll.",
        );
      if (action.type === "closePoll") poll.closed = true;
      else {
        state.polls = state.polls.filter((item) => item.id !== poll.id);
        state.votes = state.votes.filter((vote) => vote.pollId !== poll.id);
      }
      return success();
    }
    case "createEvent": {
      const input = action.input;
      if (!member(input.circleId))
        return fail("Only Circle members can create an event.");
      const title = input.title.trim(),
        description = input.description.trim(),
        location = input.location.trim();
      if (title.length < 3 || title.length > 120)
        return fail("Use an event title between 3 and 120 characters.");
      if (description.length > 2000 || location.length > 200)
        return fail(
          "Keep the description under 2,000 characters and location under 200.",
        );
      const start = Date.parse(input.startsAt),
        end = Date.parse(input.endsAt);
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start <= now ||
        end <= start
      )
        return fail("Choose a future start and an end time after the start.");
      const id = uid("event");
      state.events.push({
        id,
        circleId: input.circleId,
        authorId: actor,
        title,
        description,
        location,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
        createdAt: new Date(now).toISOString(),
      });
      return success(id);
    }
    case "deleteEvent": {
      const event = state.events.find((item) => item.id === action.eventId);
      if (!event || !member(event.circleId))
        return fail("This event is not available to you.");
      if (!manager(event.circleId, event.authorId))
        return fail(
          "Only the author, owner, or an admin can delete this event.",
        );
      state.events = state.events.filter((item) => item.id !== event.id);
      state.rsvps = state.rsvps.filter((rsvp) => rsvp.eventId !== event.id);
      return success();
    }
    case "rsvpEvent": {
      const event = state.events.find((item) => item.id === action.eventId);
      if (!event || !member(event.circleId) || isBlocked(app, event.authorId))
        return fail("This event is not available to you.");
      if (Date.parse(event.endsAt) <= now)
        return fail("This event has already ended.");
      if (!["going", "maybe", "not_going"].includes(action.response))
        return fail("Choose going, maybe, or not going.");
      state.rsvps = state.rsvps.filter(
        (rsvp) => !(rsvp.eventId === event.id && rsvp.userId === actor),
      );
      state.rsvps.push({
        eventId: event.id,
        userId: actor,
        response: action.response,
      });
      return success();
    }
    case "markCaughtUp": {
      if (!member(action.circleId))
        return fail("Only members can catch up with this Circle.");
      const seen = Date.parse(action.seenAt);
      if (!Number.isFinite(seen) || seen > now)
        return fail(
          "The catch-up time must be valid and cannot be in the future.",
        );
      const existing = state.readStates.find(
        (read) => read.circleId === action.circleId && read.userId === actor,
      );
      if (existing)
        existing.seenAt = new Date(
          Math.max(Date.parse(existing.seenAt), seen),
        ).toISOString();
      else
        state.readStates.push({
          circleId: action.circleId,
          userId: actor,
          seenAt: new Date(seen).toISOString(),
        });
      return success();
    }
    case "saveTheme": {
      if (!canManageFeatures(app, action.circleId))
        return fail(
          "Only the owner or an admin can change this Circle’s theme.",
        );
      if (!validateTheme(action.theme))
        return fail("Choose a valid Circle theme.");
      if (action.theme.source !== "preset")
        return fail(
          "AI theme proposals require a configured backend. Demo themes use local presets.",
        );
      state.themes[action.circleId] = { ...action.theme };
      return success();
    }
  }
}
