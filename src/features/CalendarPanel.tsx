import React, { useEffect, useState } from "react";
import { View, Pressable, useWindowDimensions } from "react-native";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Plus,
  Trash2,
  X,
} from "lucide-react-native";
import { useCircle } from "../state/CircleProvider";
import { useCircleFeatures } from "./CircleFeaturesProvider";
import {
  T,
  Avatar,
  Banner,
  Button,
  Card,
  Empty,
  Field,
  IconButton,
  Loading,
} from "../ui/primitives";
import { colors as baseColors, font } from "../ui/theme";
import { useCircleTheme, themeTint } from "./theme-context";
import type { Result } from "../types";
import type { EventRSVP } from "./types";

const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
function parseLocal(date: string, time: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const clock = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!match || !clock) return null;
  const y = Number(match[1]),
    m = Number(match[2]),
    d = Number(match[3]),
    h = Number(clock[1]),
    min = Number(clock[2]);
  const value = new Date(y, m - 1, d, h, min);
  return value.getFullYear() === y &&
    value.getMonth() === m - 1 &&
    value.getDate() === d &&
    value.getHours() === h &&
    value.getMinutes() === min
    ? value
    : null;
}
function eventOnDate(start: string, end: string, key: string) {
  const first = dateKey(new Date(start));
  const last = dateKey(new Date(Date.parse(end) - 1));
  return first <= key && last >= key;
}
const readableDate = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
const zone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "your device timezone";
export function CalendarPanel({ circleId }: { circleId: string }) {
  const theme = useCircleTheme();
  const c = {
    ...baseColors,
    teal: theme.accent,
    ink: theme.ink,
    white: theme.surface,
    mint: themeTint(theme.accent, 0.08),
  };
  const { state, user } = useCircle();
  const { events, rsvps, ready, error, actions } = useCircleFeatures();
  const { width } = useWindowDimensions();
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [composer, setComposer] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("20:00");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const membership = state.members.find(
    (m) => m.circleId === circleId && m.userId === user?.id,
  );
  const manager = !!membership && ["owner", "admin"].includes(membership.role);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const circleEvents = events
    .filter((event) => event.circleId === circleId)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const visible = selected
    ? circleEvents.filter((event) =>
        eventOnDate(event.startsAt, event.endsAt, selected),
      )
    : circleEvents.filter((event) => Date.parse(event.endsAt) >= now);
  const firstWeekday = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((firstWeekday + days) / 7) * 7 },
    (_, index) => index - firstWeekday + 1,
  );
  async function run(
    key: string,
    operation: () => Promise<Result>,
    success?: string,
  ) {
    if (busy) return { ok: false };
    setBusy(key);
    try {
      const result = await operation();
      setNotice(
        result.ok
          ? success || ""
          : result.error ||
              "This event could not be updated. Please try again.",
      );
      return result;
    } catch {
      setNotice(
        "This event could not be updated. Check your connection and try again.",
      );
      return { ok: false };
    } finally {
      setBusy(null);
    }
  }
  function openComposer() {
    const next = selected ? parseLocal(selected, "18:00") : new Date();
    if (!next || next.getTime() < Date.now()) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setStartDate(dateKey(tomorrow));
      setEndDate(dateKey(tomorrow));
    } else {
      setStartDate(dateKey(next));
      setEndDate(dateKey(next));
    }
    setComposer(true);
  }
  async function create() {
    const start = parseLocal(startDate, startTime),
      end = parseLocal(endDate, endTime);
    if (title.trim().length < 3 || title.trim().length > 120) {
      setNotice("Give your event a title between 3 and 120 characters.");
      return;
    }
    if (!start || !end) {
      setNotice("Use YYYY-MM-DD for dates and HH:mm (24-hour) for times.");
      return;
    }
    if (start.getTime() <= Date.now()) {
      setNotice("Choose a start time in the future.");
      return;
    }
    if (end <= start) {
      setNotice("The event needs to end after it starts.");
      return;
    }
    const result = await run(
      "create",
      () =>
        actions.createEvent({
          circleId,
          title: title.trim(),
          description: description.trim(),
          location: location.trim(),
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
        }),
      "It’s on the calendar. A little something to look forward to.",
    );
    if (result.ok) {
      setTitle("");
      setDescription("");
      setLocation("");
      setComposer(false);
      setSelected(dateKey(start));
      setMonth(new Date(start.getFullYear(), start.getMonth(), 1));
    }
  }
  if (!membership)
    return (
      <Empty
        title="Plans stay in your Circle"
        body="Join this Circle to see its calendar and make plans together."
      />
    );
  if (!ready) return <Loading />;
  return (
    <View
      style={{ gap: 22, maxWidth: 950, width: "100%", alignSelf: "center" }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, minWidth: 190, gap: 7 }}>
          <T
            style={{
              color: c.teal,
              fontFamily: font.bold,
              fontSize: 9,
              letterSpacing: 1.6,
            }}
          >
            MAKE TIME FOR EACH OTHER
          </T>
          <T
            style={{
              fontFamily: font.heading,
              fontSize: 25,
              letterSpacing: -0.6,
            }}
          >
            Good things ahead.
          </T>
          <T style={{ fontSize: 12, color: c.muted, lineHeight: 20 }}>
            A shared calendar for the moments worth showing up for.
          </T>
        </View>
        <Button
          icon={composer ? X : Plus}
          secondary={composer}
          onPress={() => (composer ? setComposer(false) : openComposer())}
        >
          {composer ? "Cancel" : "Create an event"}
        </Button>
      </View>
      {notice ? <Banner text={notice} onDismiss={() => setNotice("")} /> : null}
      {error && <Banner text={error} />}
      {composer && (
        <Card style={{ padding: width < 600 ? 20 : 28, gap: 7 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginBottom: 13,
            }}
          >
            <CalendarDays size={20} color={c.teal} />
            <T style={{ fontFamily: font.heading, fontSize: 18 }}>
              Make a little plan
            </T>
          </View>
          <Field
            label="Event title"
            placeholder="Sunday lunch, match day, a neighborhood walk…"
            value={title}
            onChangeText={setTitle}
            maxLength={120}
          />
          <Field
            label="Details"
            accessibilityLabel="Event details"
            placeholder="What should your people know?"
            multiline
            value={description}
            onChangeText={setDescription}
            maxLength={2000}
          />
          <Field
            label="Location"
            accessibilityLabel="Event location"
            placeholder="A place, address, or meeting link · optional"
            value={location}
            onChangeText={setLocation}
            maxLength={200}
          />
          <View
            style={{
              backgroundColor: c.mint,
              padding: 12,
              borderRadius: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <Clock3 size={15} color={c.teal} />
            <T style={{ fontSize: 11, color: c.teal, flex: 1, lineHeight: 19 }}>
              All times use {zone()}. Members in other timezones see their local
              time.
            </T>
          </View>
          <View
            style={{ flexDirection: width < 480 ? "column" : "row", gap: 14 }}
          >
            <View style={width < 480 ? { width: "100%" } : { flex: 1 }}>
              <Field
                label="Start date"
                placeholder="YYYY-MM-DD"
                value={startDate}
                onChangeText={setStartDate}
                autoCorrect={false}
                autoCapitalize="none"
                maxLength={10}
              />
            </View>
            <View style={width < 480 ? { width: "100%" } : { flex: 1 }}>
              <Field
                label="Start time"
                placeholder="HH:mm"
                value={startTime}
                onChangeText={setStartTime}
                autoCorrect={false}
                maxLength={5}
              />
            </View>
          </View>
          <View
            style={{ flexDirection: width < 480 ? "column" : "row", gap: 14 }}
          >
            <View style={width < 480 ? { width: "100%" } : { flex: 1 }}>
              <Field
                label="End date"
                placeholder="YYYY-MM-DD"
                value={endDate}
                onChangeText={setEndDate}
                autoCorrect={false}
                autoCapitalize="none"
                maxLength={10}
              />
            </View>
            <View style={width < 480 ? { width: "100%" } : { flex: 1 }}>
              <Field
                label="End time"
                placeholder="HH:mm"
                value={endTime}
                onChangeText={setEndTime}
                autoCorrect={false}
                maxLength={5}
              />
            </View>
          </View>
          <Button disabled={!!busy} icon={CalendarDays} onPress={create}>
            {busy === "create"
              ? "Adding your event…"
              : "Add to Circle calendar"}
          </Button>
        </Card>
      )}
      <Card style={{ padding: width < 600 ? 16 : 25, gap: 18 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <View style={{ gap: 4 }}>
            <T style={{ fontFamily: font.heading, fontSize: 20 }}>
              {month.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </T>
            <T style={{ fontSize: 10, color: c.muted }}>
              Your Circle’s shared calendar · {zone()}
            </T>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <IconButton
              icon={ChevronLeft}
              label="Previous calendar month"
              onPress={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            />
            <IconButton
              icon={ChevronRight}
              label="Next calendar month"
              onPress={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            />
          </View>
        </View>
        <View style={{ flexDirection: "row" }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <View
              key={day}
              style={{
                width: "14.285714%",
                alignItems: "center",
                paddingVertical: 8,
              }}
            >
              <T
                style={{ fontSize: 10, color: c.muted, fontFamily: font.bold }}
              >
                {day}
              </T>
            </View>
          ))}
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            borderTopWidth: 1,
            borderColor: c.line,
          }}
        >
          {cells.map((day, index) => {
            const valid = day > 0 && day <= days;
            const dayDate = new Date(
              month.getFullYear(),
              month.getMonth(),
              day,
            );
            const key = dateKey(dayDate);
            const count = valid
              ? circleEvents.filter((event) =>
                  eventOnDate(event.startsAt, event.endsAt, key),
                ).length
              : 0;
            const today = key === dateKey(new Date(now));
            const active = selected === key;
            return (
              <View
                key={index}
                style={{
                  width: "14.285714%",
                  padding: 3,
                  borderBottomWidth: 1,
                  borderColor: c.line,
                }}
              >
                {valid ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${readableDate(dayDate)}, ${count} ${count === 1 ? "event" : "events"}`}
                    accessibilityState={{ selected: active }}
                    aria-pressed={active}
                    onPress={() => setSelected(active ? null : key)}
                    style={{
                      minHeight: width < 600 ? 51 : 76,
                      paddingTop: width < 600 ? 7 : 11,
                      paddingHorizontal: 4,
                      gap: 7,
                      alignItems: "center",
                      borderRadius: 11,
                      backgroundColor: active
                        ? c.teal
                        : today
                          ? c.mint
                          : "transparent",
                    }}
                  >
                    <T
                      style={{
                        fontSize: width < 600 ? 12 : 14,
                        color: active ? "white" : today ? c.teal : c.ink,
                        fontFamily: today || active ? font.bold : font.regular,
                      }}
                    >
                      {day}
                    </T>
                    {count > 0 && (
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 3,
                          alignItems: "center",
                        }}
                      >
                        {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                          <View
                            key={i}
                            style={{
                              height: 4,
                              width: 4,
                              borderRadius: 2,
                              backgroundColor: active ? "#FFFFFFBB" : c.teal,
                            }}
                          />
                        ))}
                      </View>
                    )}
                  </Pressable>
                ) : (
                  <View style={{ minHeight: width < 600 ? 51 : 76 }} />
                )}
              </View>
            );
          })}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            justifyContent: "space-between",
          }}
        >
          <T style={{ fontSize: 10, color: c.muted, flex: 1 }}>
            Tap a date to see what’s happening.
          </T>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMonth(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              );
              setSelected(null);
            }}
            style={{ padding: 6 }}
          >
            <T style={{ fontSize: 11, color: c.teal, fontFamily: font.bold }}>
              Back to today
            </T>
          </Pressable>
        </View>
      </Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          justifyContent: "space-between",
        }}
      >
        <T style={{ fontFamily: font.heading, fontSize: 18, flex: 1 }}>
          {selected
            ? readableDate(parseLocal(selected, "12:00")!)
            : "Coming up in your Circle"}
        </T>
        {selected && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelected(null)}
            style={{ padding: 6 }}
          >
            <T style={{ fontSize: 11, color: c.teal, fontFamily: font.bold }}>
              All upcoming
            </T>
          </Pressable>
        )}
      </View>
      {!visible.length && (
        <Empty
          title={
            selected
              ? "A little room in the calendar."
              : "Something to look forward to."
          }
          body={
            selected
              ? "Nothing is planned for this day yet. Make a little plan with your Circle."
              : "Create your first event and give your people a reason to get together."
          }
        >
          <Button secondary icon={Plus} onPress={openComposer}>
            Plan something
          </Button>
        </Empty>
      )}
      {visible.map((event) => {
        const start = new Date(event.startsAt),
          end = new Date(event.endsAt);
        const eventRsvps = rsvps.filter((r) => r.eventId === event.id);
        const own = eventRsvps.find((r) => r.userId === user?.id);
        const going = eventRsvps.filter((r) => r.response === "going");
        const maybe = eventRsvps.filter((r) => r.response === "maybe");
        const ended = end.getTime() <= now;
        const canManage = event.authorId === user?.id || manager;
        const author = state.users.find((u) => u.id === event.authorId);
        return (
          <Card
            key={event.id}
            style={{ padding: width < 600 ? 20 : 26, gap: 20 }}
          >
            <View
              style={{
                flexDirection: "row",
                gap: 17,
                alignItems: "flex-start",
              }}
            >
              <View
                style={{
                  width: 55,
                  borderRadius: 12,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: "#DDE8DC",
                  alignItems: "center",
                  backgroundColor: themeTint(theme.accent, 0.04),
                }}
              >
                <T
                  style={{
                    fontSize: 9,
                    fontFamily: font.bold,
                    color: c.teal,
                    backgroundColor: themeTint(theme.accent, 0.1),
                    width: "100%",
                    textAlign: "center",
                    paddingVertical: 6,
                    letterSpacing: 1,
                  }}
                >
                  {start
                    .toLocaleDateString(undefined, { month: "short" })
                    .toUpperCase()}
                </T>
                <T
                  style={{
                    fontSize: 25,
                    fontFamily: font.heading,
                    paddingVertical: 7,
                  }}
                >
                  {start.getDate()}
                </T>
              </View>
              <View style={{ flex: 1, gap: 9 }}>
                <T
                  style={{
                    fontFamily: font.heading,
                    fontSize: 19,
                    lineHeight: 27,
                  }}
                >
                  {event.title}
                </T>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 6,
                  }}
                >
                  <Clock3 size={13} color={c.muted} />
                  <T
                    style={{
                      fontSize: 11,
                      color: c.muted,
                      flex: 1,
                      lineHeight: 17,
                    }}
                  >
                    {start.toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    –{" "}
                    {end.toLocaleString(undefined, {
                      ...(dateKey(start) === dateKey(end)
                        ? {}
                        : { month: "short" as const, day: "numeric" as const }),
                      hour: "numeric",
                      minute: "2-digit",
                      timeZoneName: "short",
                    })}
                  </T>
                </View>
                {event.location && (
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 6,
                      alignItems: "flex-start",
                    }}
                  >
                    <MapPin size={13} color={c.muted} />
                    <T
                      style={{
                        fontSize: 11,
                        color: c.muted,
                        flex: 1,
                        lineHeight: 18,
                      }}
                    >
                      {event.location}
                    </T>
                  </View>
                )}
              </View>
              {canManage && (
                <IconButton
                  icon={Trash2}
                  label={`Delete event: ${event.title}`}
                  color={c.muted}
                  onPress={() =>
                    setDeleting(deleting === event.id ? null : event.id)
                  }
                />
              )}
            </View>
            {!!event.description && (
              <T style={{ fontSize: 13, lineHeight: 22, color: c.ink }}>
                {event.description}
              </T>
            )}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 9,
                flexWrap: "wrap",
              }}
            >
              {going.length > 0 && (
                <View style={{ flexDirection: "row", paddingLeft: 5 }}>
                  {going.slice(0, 4).map((rsvp) => {
                    const person = state.users.find(
                      (u) => u.id === rsvp.userId,
                    );
                    return (
                      <View key={rsvp.userId} style={{ marginLeft: -5 }}>
                        <Avatar
                          uri={person?.avatar}
                          name={person?.name || "Circle member"}
                          size={24}
                          border
                        />
                      </View>
                    );
                  })}
                </View>
              )}
              <T style={{ fontSize: 11, color: c.muted }}>
                {going.length} going · {maybe.length} maybe
              </T>
              <View style={{ flex: 1 }} />
              <T style={{ fontSize: 10, color: c.muted }}>
                {ended
                  ? "Event ended"
                  : `Planned by ${author?.name.split(" ")[0] || "a Circle member"}`}
              </T>
            </View>
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                flexWrap: "wrap",
                paddingTop: 17,
                borderTopWidth: 1,
                borderColor: c.line,
              }}
            >
              {(
                [
                  ["going", "Going"],
                  ["maybe", "Maybe"],
                  ["not_going", "Can’t go"],
                ] as [EventRSVP["response"], string][]
              ).map(([response, label]) => {
                const active = own?.response === response;
                return (
                  <Pressable
                    key={response}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} to ${event.title}`}
                    accessibilityState={{
                      selected: active,
                      disabled: ended || !!busy,
                    }}
                    aria-pressed={active}
                    disabled={ended || !!busy}
                    onPress={() =>
                      run(`rsvp-${event.id}`, () =>
                        actions.rsvpEvent(event.id, response),
                      )
                    }
                    style={{
                      flexDirection: "row",
                      gap: 6,
                      alignItems: "center",
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: active ? c.teal : c.line,
                      backgroundColor: active ? c.mint : "#FBFCFA",
                      opacity: ended ? 0.5 : 1,
                    }}
                  >
                    {active && <Check size={12} color={c.teal} />}
                    <T
                      style={{
                        fontSize: 12,
                        fontFamily: active ? font.bold : font.medium,
                        color: active ? c.teal : c.muted,
                      }}
                    >
                      {label}
                    </T>
                  </Pressable>
                );
              })}
            </View>
            {deleting === event.id && (
              <View
                style={{
                  backgroundColor: "#FAF2EC",
                  padding: 16,
                  borderRadius: 11,
                  gap: 12,
                }}
              >
                <T style={{ fontSize: 12, lineHeight: 20 }}>
                  Delete this event and its RSVPs? This cannot be undone.
                </T>
                <View
                  style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}
                >
                  <Button
                    disabled={!!busy}
                    onPress={async () => {
                      const result = await run(
                        `delete-${event.id}`,
                        () => actions.deleteEvent(event.id),
                        "Event deleted from the Circle calendar.",
                      );
                      if (result.ok) setDeleting(null);
                    }}
                  >
                    Delete event permanently
                  </Button>
                  <Button secondary onPress={() => setDeleting(null)}>
                    Keep event
                  </Button>
                </View>
              </View>
            )}
          </Card>
        );
      })}
    </View>
  );
}
