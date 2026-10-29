import type { AppState } from "../types";
import type { FeatureState } from "./types";
import { emptyFeatures, pruneFeatures } from "./model";
import { presetThemes } from "./themes";

/** Relative dates keep a restored demo useful without pretending it is live data. */
export function createFeatureSeed(
  app: AppState,
  now = Date.now(),
): FeatureState {
  const state = emptyFeatures();
  const at = (days: number, hours = 0) =>
    new Date(now + (days * 24 + hours) * 3600_000).toISOString();
  const choices = (prefix: string, labels: string[]) =>
    labels.map((label, index) => ({ id: `${prefix}-${index + 1}`, label }));
  state.polls = [
    {
      id: "poll-family",
      circleId: "family",
      authorId: "sarah",
      question: "How should we spend our next family Sunday?",
      options: choices("family-option", [
        "A picnic in the park 🌿",
        "Pancakes & board games 🥞",
        "A little seaside adventure 🌊",
      ]),
      createdAt: at(-1, 2),
      closesAt: at(3),
      closed: false,
    },
    {
      id: "poll-school",
      circleId: "school",
      authorId: "emma",
      question: "Which book fair activity would the kids love most?",
      options: choices("school-option", [
        "Story time under the stars",
        "Make your own bookmark",
        "Meet a local author",
      ]),
      createdAt: at(-1, 5),
      closesAt: at(4),
      closed: false,
    },
    {
      id: "poll-football",
      circleId: "football",
      authorId: "alex",
      question: "Match day plans — where are we watching?",
      options: choices("football-option", [
        "The usual spot 🍻",
        "A garden watch party",
        "At the stadium ⚽",
      ]),
      createdAt: at(-1, 10),
      closesAt: at(2),
      closed: false,
    },
    {
      id: "poll-neighborhood",
      circleId: "neighborhood",
      authorId: "olivia",
      question: "What would make our neighborhood a little brighter?",
      options: choices("neighborhood-option", [
        "A community garden 🌻",
        "A monthly street market",
        "A weekend clean-up crew",
      ]),
      createdAt: at(-1, 12),
      closesAt: at(5),
      closed: false,
    },
  ];
  state.votes = [
    { pollId: "poll-family", userId: "james", optionId: "family-option-1" },
    { pollId: "poll-family", userId: "emma", optionId: "family-option-2" },
    { pollId: "poll-family", userId: "olivia", optionId: "family-option-1" },
    { pollId: "poll-school", userId: "sarah", optionId: "school-option-1" },
    { pollId: "poll-school", userId: "james", optionId: "school-option-3" },
    {
      pollId: "poll-football",
      userId: "daniel",
      optionId: "football-option-1",
    },
    { pollId: "poll-football", userId: "james", optionId: "football-option-2" },
    {
      pollId: "poll-neighborhood",
      userId: "olivia",
      optionId: "neighborhood-option-1",
    },
    {
      pollId: "poll-neighborhood",
      userId: "emma",
      optionId: "neighborhood-option-1",
    },
  ];
  state.events = [
    {
      id: "event-family",
      circleId: "family",
      authorId: "sarah",
      title: "A slow Sunday picnic",
      description:
        "Bring a blanket, something to share, and your favorite people. We’ll find a sunny spot by the old oak tree.",
      location: "Riverside Park · by the big oak",
      startsAt: at(3),
      endsAt: at(3, 3),
      createdAt: at(-1, 2),
    },
    {
      id: "event-school",
      circleId: "school",
      authorId: "emma",
      title: "Stories, snacks & the book fair",
      description:
        "An afternoon of new adventures between the pages. Parents are welcome to stay and help out.",
      location: "School library",
      startsAt: at(5),
      endsAt: at(5, 2),
      createdAt: at(-1, 5),
    },
    {
      id: "event-football",
      circleId: "football",
      authorId: "alex",
      title: "Saturday match day",
      description:
        "The big game, a few friendly rivalries, and the usual crew. Come a little early to grab a good seat.",
      location: "The Corner House",
      startsAt: at(2),
      endsAt: at(2, 3),
      createdAt: at(-1, 10),
    },
    {
      id: "event-neighborhood",
      circleId: "neighborhood",
      authorId: "olivia",
      title: "Coffee & a little neighborhood care",
      description:
        "A gentle morning walk, a quick park tidy-up, and coffee together afterward. Every helping hand makes a difference.",
      location: "Meet at the community garden gate",
      startsAt: at(6),
      endsAt: at(6, 2),
      createdAt: at(-1, 12),
    },
  ];
  state.rsvps = [
    { eventId: "event-family", userId: "james", response: "going" },
    { eventId: "event-family", userId: "emma", response: "going" },
    { eventId: "event-school", userId: "sarah", response: "going" },
    { eventId: "event-school", userId: "james", response: "maybe" },
    { eventId: "event-football", userId: "daniel", response: "going" },
    { eventId: "event-football", userId: "james", response: "going" },
    { eventId: "event-neighborhood", userId: "olivia", response: "going" },
    { eventId: "event-neighborhood", userId: "sarah", response: "maybe" },
  ];
  state.themes.family = {
    ...presetThemes.find((theme) => theme.id === "unicorn")!,
  };
  state.readStates = app.members.map((member) => ({
    circleId: member.circleId,
    userId: member.userId,
    seenAt: at(-2),
  }));
  return pruneFeatures(state, app);
}
