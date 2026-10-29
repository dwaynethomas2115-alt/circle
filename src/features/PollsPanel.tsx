import React, { useEffect, useState } from "react";
import { View, Pressable, Switch, useWindowDimensions } from "react-native";
import {
  BarChart3,
  Check,
  CheckCircle2,
  Clock3,
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

function localDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(
    value.trim(),
  );
  if (!match) return null;
  const [, y, m, d, h, min] = match.map(Number);
  const date = new Date(y, m - 1, d, h, min);
  return date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d &&
    date.getHours() === h &&
    date.getMinutes() === min
    ? date
    : null;
}
const zone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "your device timezone";
export function PollsPanel({ circleId }: { circleId: string }) {
  const theme = useCircleTheme();
  const c = {
    ...baseColors,
    teal: theme.accent,
    ink: theme.ink,
    white: theme.surface,
    mint: themeTint(theme.accent, 0.08),
  };
  const { state, user } = useCircle();
  const { polls, votes, ready, error, actions } = useCircleFeatures();
  const { width } = useWindowDimensions();
  const [composer, setComposer] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [expiry, setExpiry] = useState("");
  const [useExpiry, setUseExpiry] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const membership = state.members.find(
    (m) => m.circleId === circleId && m.userId === user?.id,
  );
  const manager = !!membership && ["owner", "admin"].includes(membership.role);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const circlePolls = polls
    .filter((p) => p.circleId === circleId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
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
          : result.error || "The poll could not be updated. Please try again.",
      );
      return result;
    } catch {
      setNotice(
        "The poll could not be updated. Check your connection and try again.",
      );
      return { ok: false };
    } finally {
      setBusy(null);
    }
  }
  async function create() {
    const labels = options.map((x) => x.trim());
    const closeDate = useExpiry ? localDateTime(expiry) : null;
    if (question.trim().length < 3 || question.trim().length > 240) {
      setNotice("Write a question between 3 and 240 characters.");
      return;
    }
    if (
      labels.length < 2 ||
      labels.length > 6 ||
      labels.some((x) => !x || x.length > 100)
    ) {
      setNotice("Add between 2 and 6 options, each with 1–100 characters.");
      return;
    }
    if (new Set(labels.map((x) => x.toLowerCase())).size !== labels.length) {
      setNotice("Each option needs to be different.");
      return;
    }
    if (useExpiry && (!closeDate || closeDate.getTime() <= Date.now())) {
      setNotice(
        "Choose a future closing time using YYYY-MM-DD HH:mm in your device timezone.",
      );
      return;
    }
    const result = await run(
      "create",
      () =>
        actions.createPoll(
          circleId,
          question.trim(),
          labels,
          closeDate?.toISOString(),
        ),
      "Your question is out there. Let your Circle weigh in.",
    );
    if (result.ok) {
      setQuestion("");
      setOptions(["", ""]);
      setExpiry("");
      setUseExpiry(false);
      setComposer(false);
    }
  }
  if (!membership)
    return (
      <Empty
        title="A decision for your Circle"
        body="Join this Circle to see its polls and take part."
      />
    );
  if (!ready) return <Loading />;
  return (
    <View
      style={{ gap: 20, maxWidth: 850, width: "100%", alignSelf: "center" }}
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
            LITTLE QUESTIONS, SHARED DECISIONS
          </T>
          <T
            style={{
              fontFamily: font.heading,
              fontSize: 25,
              letterSpacing: -0.6,
            }}
          >
            Everyone gets a say.
          </T>
          <T style={{ fontSize: 12, color: c.muted, lineHeight: 20 }}>
            Find a time, pick a place, make a little plan together.
          </T>
        </View>
        <Button
          icon={composer ? X : Plus}
          secondary={composer}
          onPress={() => setComposer(!composer)}
        >
          {composer ? "Cancel" : "Create a poll"}
        </Button>
      </View>
      {notice ? <Banner text={notice} onDismiss={() => setNotice("")} /> : null}
      {error && <Banner text={error} />}
      {composer && (
        <Card style={{ padding: width < 600 ? 20 : 28, gap: 8 }}>
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <BarChart3 size={20} color={c.teal} />
            <T style={{ fontFamily: font.heading, fontSize: 18 }}>
              Ask your people
            </T>
          </View>
          <Field
            label="Poll question"
            placeholder="What should we do this weekend?"
            value={question}
            onChangeText={setQuestion}
            maxLength={240}
          />
          <T style={{ fontFamily: font.bold, fontSize: 12, marginBottom: 5 }}>
            The options
          </T>
          {options.map((option, index) => (
            <View
              key={index}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <View style={{ flex: 1 }}>
                <Field
                  accessibilityLabel={`Poll option ${index + 1}`}
                  placeholder={`Option ${index + 1}`}
                  value={option}
                  maxLength={100}
                  onChangeText={(text) =>
                    setOptions((current) =>
                      current.map((x, i) => (i === index ? text : x)),
                    )
                  }
                  style={{ marginBottom: -4 }}
                />
              </View>
              {options.length > 2 && (
                <IconButton
                  icon={X}
                  label={`Remove poll option ${index + 1}`}
                  onPress={() =>
                    setOptions((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
                />
              )}
            </View>
          ))}
          {options.length < 6 && (
            <Button
              secondary
              icon={Plus}
              onPress={() => setOptions([...options, ""])}
              style={{ alignSelf: "flex-start", marginBottom: 12 }}
            >
              Add an option
            </Button>
          )}
          <View
            style={{
              flexDirection: "row",
              gap: 15,
              alignItems: "center",
              paddingVertical: 16,
              borderTopWidth: 1,
              borderColor: c.line,
            }}
          >
            <View style={{ flex: 1, gap: 5 }}>
              <T style={{ fontFamily: font.bold, fontSize: 12 }}>
                Set a closing time
              </T>
              <T style={{ fontSize: 11, color: c.muted }}>
                Or leave it open until you have your answer.
              </T>
            </View>
            <Switch
              accessibilityLabel="Set poll closing time"
              value={useExpiry}
              onValueChange={setUseExpiry}
              trackColor={{ false: "#DDE5DD", true: c.teal }}
              thumbColor="white"
            />
          </View>
          {useExpiry && (
            <View>
              <Field
                label="Poll closes at"
                accessibilityLabel="Poll closes at"
                placeholder="YYYY-MM-DD HH:mm"
                value={expiry}
                onChangeText={setExpiry}
                autoCorrect={false}
                autoCapitalize="none"
              />
              <T
                style={{
                  fontSize: 10,
                  color: c.muted,
                  lineHeight: 18,
                  marginTop: -8,
                  marginBottom: 14,
                }}
              >
                24-hour time · {zone()}. Members see the same instant in their
                own timezone.
              </T>
            </View>
          )}
          <Button disabled={!!busy} icon={BarChart3} onPress={create}>
            {busy === "create" ? "Sharing your question…" : "Share poll"}
          </Button>
        </Card>
      )}
      {!circlePolls.length && !composer && (
        <Empty
          title="A good question brings people together."
          body="Make your first poll. One vote per member, and room to change your mind."
        >
          <Button icon={Plus} onPress={() => setComposer(true)}>
            Ask your Circle
          </Button>
        </Empty>
      )}
      {circlePolls.map((poll) => {
        const author = state.users.find((x) => x.id === poll.authorId);
        const pollVotes = votes.filter((v) => v.pollId === poll.id);
        const ownVote = pollVotes.find((v) => v.userId === user?.id);
        const total = pollVotes.length;
        const closed =
          poll.closed || !!(poll.closesAt && Date.parse(poll.closesAt) <= now);
        const canManage = poll.authorId === user?.id || manager;
        return (
          <Card
            key={poll.id}
            style={{ padding: width < 600 ? 20 : 28, gap: 18 }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Avatar
                uri={author?.avatar}
                name={author?.name || "Circle member"}
                size={35}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <T style={{ fontFamily: font.bold, fontSize: 12 }}>
                  {author?.name || "Circle member"}
                </T>
                <T style={{ color: c.muted, fontSize: 10 }}>
                  {new Date(poll.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · Circle poll
                </T>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 20,
                  backgroundColor: closed ? "#F0F2EE" : c.mint,
                }}
              >
                {closed ? (
                  <Check size={11} color={c.muted} />
                ) : (
                  <View
                    style={{
                      height: 5,
                      width: 5,
                      borderRadius: 3,
                      backgroundColor: c.teal,
                    }}
                  />
                )}
                <T
                  style={{
                    fontSize: 10,
                    fontFamily: font.bold,
                    color: closed ? c.muted : c.teal,
                  }}
                >
                  {closed ? "Closed" : "Open for votes"}
                </T>
              </View>
            </View>
            <T
              style={{ fontFamily: font.heading, fontSize: 21, lineHeight: 29 }}
            >
              {poll.question}
            </T>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={poll.question}
              style={{ gap: 10 }}
            >
              {poll.options.map((option) => {
                const count = pollVotes.filter(
                  (v) => v.optionId === option.id,
                ).length;
                const percent = total ? Math.round((count / total) * 100) : 0;
                const selected = ownVote?.optionId === option.id;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`Vote for ${option.label} in ${poll.question}`}
                    accessibilityState={{
                      checked: selected,
                      disabled: closed || !!busy,
                    }}
                    aria-checked={selected}
                    disabled={closed || !!busy}
                    onPress={() =>
                      run(`vote-${poll.id}`, () =>
                        actions.vote(poll.id, option.id),
                      )
                    }
                    style={{
                      minHeight: 54,
                      borderRadius: 11,
                      borderWidth: 1,
                      borderColor: selected ? c.teal : c.line,
                      overflow: "hidden",
                      backgroundColor: themeTint(theme.accent, 0.025),
                      paddingHorizontal: 14,
                      paddingVertical: 13,
                      justifyContent: "center",
                    }}
                  >
                    <View
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${percent}%`,
                        backgroundColor: themeTint(
                          theme.accent,
                          selected ? 0.15 : 0.07,
                        ),
                      }}
                    />
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 9,
                      }}
                    >
                      {selected ? (
                        <CheckCircle2 size={17} color={c.teal} />
                      ) : (
                        <View
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: "#C8D2C8",
                          }}
                        />
                      )}
                      <T
                        style={{
                          flex: 1,
                          fontSize: 13,
                          fontFamily: selected ? font.bold : font.regular,
                          color: selected ? c.teal : c.ink,
                        }}
                      >
                        {option.label}
                      </T>
                      <T style={{ fontSize: 11, color: c.muted }}>
                        {count} · {percent}%
                      </T>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <T
                style={{ fontSize: 11, color: c.muted, flex: 1, minWidth: 130 }}
              >
                {total
                  ? `${total} ${total === 1 ? "vote" : "votes"}`
                  : "No votes yet"}{" "}
                ·{" "}
                {ownVote && !closed
                  ? "Tap another option to change your vote."
                  : closed
                    ? "Voting has ended."
                    : "One vote per member."}
              </T>
              {canManage && !closed && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Close poll: ${poll.question}`}
                  disabled={!!busy}
                  onPress={() =>
                    run(
                      `close-${poll.id}`,
                      () => actions.closePoll(poll.id),
                      "This poll is now closed.",
                    )
                  }
                  style={{ padding: 8 }}
                >
                  <T
                    style={{
                      color: c.teal,
                      fontSize: 11,
                      fontFamily: font.bold,
                    }}
                  >
                    Close poll
                  </T>
                </Pressable>
              )}
              {canManage && (
                <IconButton
                  icon={Trash2}
                  color={c.muted}
                  label={`Delete poll: ${poll.question}`}
                  onPress={() =>
                    setDeleting(deleting === poll.id ? null : poll.id)
                  }
                />
              )}
            </View>
            {poll.closesAt && (
              <View
                style={{
                  flexDirection: "row",
                  gap: 6,
                  alignItems: "center",
                  marginTop: -8,
                }}
              >
                <Clock3 size={11} color={c.muted} />
                <T style={{ fontSize: 10, color: c.muted, flex: 1 }}>
                  {closed ? "Closing time" : "Closes"}{" "}
                  {new Date(poll.closesAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZoneName: "short",
                  })}
                </T>
              </View>
            )}
            {deleting === poll.id && (
              <View
                style={{
                  padding: 16,
                  borderRadius: 10,
                  backgroundColor: "#FAF2EC",
                  gap: 12,
                }}
              >
                <T style={{ fontSize: 12, lineHeight: 20 }}>
                  Delete this poll and all its votes? This cannot be undone.
                </T>
                <View
                  style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}
                >
                  <Button
                    disabled={!!busy}
                    onPress={async () => {
                      const result = await run(
                        `delete-${poll.id}`,
                        () => actions.deletePoll(poll.id),
                        "Poll deleted.",
                      );
                      if (result.ok) setDeleting(null);
                    }}
                  >
                    Delete poll permanently
                  </Button>
                  <Button secondary onPress={() => setDeleting(null)}>
                    Keep poll
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
