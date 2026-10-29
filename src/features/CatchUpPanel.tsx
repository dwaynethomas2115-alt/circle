import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Pressable,
  Image,
  Modal,
  StyleSheet,
  Animated,
  useWindowDimensions,
  AccessibilityInfo,
} from "react-native";
import { router } from "expo-router";
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCheck,
  MessageCircle,
  Images,
  BarChart3,
  CalendarDays,
  ArrowUpRight,
  Clapperboard,
  LockKeyhole,
} from "lucide-react-native";
import { useCircle } from "../state/CircleProvider";
import { useCircleFeatures } from "./CircleFeaturesProvider";
import { buildCatchUp } from "./catchup";
import {
  T,
  Card,
  Button,
  Avatar,
  IconButton,
  Empty,
  Banner,
  Loading,
} from "../ui/primitives";
import { font, colors as c } from "../ui/theme";
import { useCircleTheme, themeTint } from "./theme-context";
import { Video, timeAgo } from "../ui/PostCard";
import type { Post } from "../types";
export function CatchUpPanel({ circleId }: { circleId: string }) {
  const { state, mode } = useCircle();
  const theme = useCircleTheme();
  const features = useCircleFeatures();
  const { width } = useWindowDimensions();
  const [cutoff] = useState(() => new Date().toISOString());
  const [open, setOpen] = useState(false),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false);
  const summary = buildCatchUp(state, features, circleId, cutoff);
  const circle = state.circles.find((x) => x.id === circleId);
  if (!features.ready) return <Loading />;
  if (!summary.authorized)
    return (
      <Empty
        title="A recap for your people"
        body="Join this Circle to see the moments shared inside."
      />
    );
  async function markRead() {
    setSaving(true);
    const result = await features.actions.markCaughtUp(
      circleId,
      summary.cutoff,
    );
    setNotice(
      result.ok
        ? "You’re all caught up. A little closer, just like that."
        : result.error || "Could not save your catch-up.",
    );
    setSaving(false);
  }
  return (
    <View
      style={{ gap: 22, maxWidth: 950, width: "100%", alignSelf: "center" }}
    >
      {!!features.error && <Banner text={features.error} />}
      {!!notice && <Banner text={notice} onDismiss={() => setNotice("")} />}
      <Card
        style={{
          padding: width < 600 ? 23 : 32,
          backgroundColor: themeTint(theme.accent, 0.06),
          borderColor: themeTint(theme.accent, 0.12),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 20,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <View style={{ flex: 1, minWidth: 200 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                marginBottom: 13,
              }}
            >
              <Clapperboard size={15} color={theme.accent} />
              <T
                style={{
                  fontFamily: font.bold,
                  fontSize: 10,
                  color: theme.accent,
                  letterSpacing: 1.7,
                }}
              >
                THE MOMENTS BETWEEN VISITS
              </T>
            </View>
            <T
              style={{
                fontFamily: font.extra,
                fontSize: width < 600 ? 27 : 34,
                letterSpacing: -1,
                lineHeight: 43,
              }}
            >
              A little while. A lot of life.
            </T>
            <T
              style={{
                color: "#7B897A",
                lineHeight: 23,
                marginTop: 10,
                maxWidth: 470,
              }}
            >
              {summary.total
                ? `${summary.total} new ${summary.total === 1 ? "update" : "updates"} from your people since your last catch-up.`
                : "You’re up to date. Take another look at the moments that made your week."}
            </T>
          </View>
          <View
            style={{
              width: 90,
              height: 90,
              borderRadius: 45,
              backgroundColor: themeTint(theme.accent, 0.12),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CheckCheck size={36} strokeWidth={1.4} color={theme.accent} />
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 26,
          }}
        >
          {[
            { label: "New moments", value: summary.posts.length, icon: Images },
            {
              label: "Chat messages",
              value: summary.messageCount,
              icon: MessageCircle,
            },
            {
              label: "Comments",
              value: summary.commentCount,
              icon: MessageCircle,
            },
            {
              label: "New polls",
              value: summary.polls.length,
              icon: BarChart3,
            },
          ].map(({ label, value, icon: Icon }) => (
            <View
              key={label}
              style={{
                flex: 1,
                minWidth: 120,
                backgroundColor: "#FFFFFFB8",
                padding: 16,
                borderRadius: 13,
                gap: 9,
              }}
            >
              <Icon size={17} color="#91A584" />
              <T style={{ fontFamily: font.heading, fontSize: 25 }}>{value}</T>
              <T style={{ fontSize: 11, color: "#8D9C84" }}>{label}</T>
            </View>
          ))}
        </View>
      </Card>
      <Card>
        <View
          style={{
            height: width < 600 ? 240 : 310,
            backgroundColor: "#173E35",
            overflow: "hidden",
          }}
        >
          {summary.montage.find((p) => p.mediaType === "image" && p.media)
            ?.media && (
            <Image
              source={{
                uri: summary.montage.find(
                  (p) => p.mediaType === "image" && p.media,
                )?.media,
              }}
              style={StyleSheet.absoluteFillObject}
            />
          )}
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: "rgba(14,38,33,.32)" },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Play Circle montage"
            disabled={!summary.montage.length}
            onPress={() => setOpen(true)}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 13,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: "#FFFFFFEE",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Play
                size={26}
                color={theme.accent}
                fill={theme.accent}
                style={{ marginLeft: 4 }}
              />
            </View>
            <T
              style={{ fontFamily: font.heading, fontSize: 24, color: "white" }}
            >
              Your Circle, in moments.
            </T>
            <T style={{ color: "#FFFFFFCE", fontSize: 12 }}>
              {summary.montage.length
                ? `${summary.montage.length} moments · Tap to relive them`
                : "Your next story starts with a shared moment."}
            </T>
          </Pressable>
        </View>
        <View
          style={{
            padding: 21,
            flexDirection: "row",
            gap: 15,
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1, gap: 5 }}>
            <T style={{ fontFamily: font.bold, fontSize: 14 }}>
              Your private Circle montage
            </T>
            <T style={{ color: c.muted, fontSize: 11, lineHeight: 18 }}>
              A playable slideshow of shared photos, videos, and thoughts. No
              music or exported video is added.
            </T>
          </View>
          <LockKeyhole size={17} color={theme.accent} />
        </View>
      </Card>
      {summary.posts.length > 0 && (
        <View style={{ gap: 13 }}>
          <T style={{ fontFamily: font.heading, fontSize: 19 }}>
            Worth a little look
          </T>
          {summary.posts.slice(0, 4).map((post) => {
            const author = state.users.find((x) => x.id === post.authorId);
            return (
              <Pressable
                key={post.id}
                accessibilityRole="link"
                onPress={() => router.push(`/post/${post.id}`)}
              >
                <Card
                  style={{
                    padding: 18,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 13,
                  }}
                >
                  <Avatar
                    uri={author?.avatar}
                    name={author?.name || "Member"}
                    size={39}
                  />
                  <View style={{ flex: 1, gap: 5 }}>
                    <T style={{ fontFamily: font.bold, fontSize: 12 }}>
                      {author?.name || "Circle member"}{" "}
                      <T style={{ fontSize: 10, color: c.muted }}>
                        · {timeAgo(post.createdAt)}
                      </T>
                    </T>
                    <T
                      numberOfLines={2}
                      style={{ fontSize: 12, lineHeight: 20, color: c.muted }}
                    >
                      {post.content || "Shared a little moment."}
                    </T>
                  </View>
                  {post.mediaType === "image" && post.media ? (
                    <Image
                      source={{ uri: post.media }}
                      style={{ width: 52, height: 52, borderRadius: 10 }}
                    />
                  ) : (
                    <ArrowUpRight size={17} color={theme.accent} />
                  )}
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
      {summary.events.length > 0 && (
        <Card style={{ padding: 23, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <CalendarDays size={18} color={theme.accent} />
            <T style={{ fontFamily: font.heading, fontSize: 18 }}>
              Something to look forward to
            </T>
          </View>
          {summary.events.slice(0, 3).map((event) => (
            <Pressable
              key={event.id}
              onPress={() => router.push(`/circle/${circleId}?tab=calendar`)}
              style={{
                paddingTop: 12,
                borderTopWidth: 1,
                borderColor: c.line,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 14,
              }}
            >
              <View style={{ gap: 6, flex: 1 }}>
                <T style={{ fontFamily: font.bold, fontSize: 13 }}>
                  {event.title}
                </T>
                <T style={{ fontSize: 11, color: c.muted }}>
                  {new Date(event.startsAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </T>
              </View>
              <ArrowUpRight size={15} color={theme.accent} />
            </Pressable>
          ))}
        </Card>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        <T
          style={{
            color: c.muted,
            fontSize: 11,
            lineHeight: 19,
            flex: 1,
            minWidth: 200,
          }}
        >
          {mode === "demo"
            ? "Your catch-up is saved on this device."
            : "Your catch-up is private to your account."}{" "}
          Your next visit starts here.
        </T>
        <Button icon={CheckCheck} onPress={markRead} disabled={saving}>
          {saving ? "Saving…" : "I’m all caught up"}
        </Button>
      </View>
      {open && (
        <Montage
          circleName={circle?.name || "Your Circle"}
          posts={summary.montage}
          onClose={() => setOpen(false)}
        />
      )}
    </View>
  );
}
function Montage({
  circleName,
  posts,
  onClose,
}: {
  circleName: string;
  posts: Post[];
  onClose: () => void;
}) {
  const { state, feed } = useCircle();
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [finished, setFinished] = useState(false);
  const [reduced, setReduced] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const allowed = new Set(feed.map((p) => p.id));
  const visible = posts.filter((p) => allowed.has(p.id));
  const post = visible[index];
  const author = state.users.find((x) => x.id === post?.authorId);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
  }, []);
  useEffect(() => {
    progress.setValue(0);
    if (paused || finished || !post || post.mediaType === "video" || reduced)
      return;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 6500,
      useNativeDriver: false,
    });
    animation.start(({ finished: done }) => {
      if (done) {
        if (index < visible.length - 1) setIndex(index + 1);
        else setFinished(true);
      }
    });
    return () => animation.stop();
  }, [index, paused, finished, post, progress, reduced, visible.length]);
  function next() {
    setFinished(false);
    if (index < visible.length - 1) setIndex(index + 1);
    else setFinished(true);
  }
  return (
    <Modal
      visible
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "#102A24",
          padding: 22,
          paddingTop: 42,
        }}
      >
        <View style={{ flexDirection: "row", gap: 5, marginBottom: 17 }}>
          {visible.map((p, i) => (
            <View
              key={p.id}
              style={{
                height: 3,
                backgroundColor: "#FFFFFF30",
                flex: 1,
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              {i < index || finished ? (
                <View
                  style={{ height: 3, backgroundColor: "white", width: "100%" }}
                />
              ) : i === index ? (
                <Animated.View
                  style={{
                    height: 3,
                    backgroundColor: "white",
                    width: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  }}
                />
              ) : null}
            </View>
          ))}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <Avatar
            uri={author?.avatar}
            name={author?.name || circleName}
            size={38}
          />
          <View style={{ flex: 1, gap: 4 }}>
            <T style={{ fontFamily: font.bold, color: "white", fontSize: 13 }}>
              {circleName}
            </T>
            <T style={{ fontSize: 11, color: "#BED0C3" }}>
              {author?.name || "Your people"}
            </T>
          </View>
          {post?.mediaType !== "video" && (
            <IconButton
              icon={paused ? Play : Pause}
              label={paused ? "Play montage" : "Pause montage"}
              color="white"
              onPress={() => setPaused(!paused)}
            />
          )}
          <IconButton
            icon={X}
            label="Close montage"
            onPress={onClose}
            color="white"
          />
        </View>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            borderRadius: 16,
            backgroundColor: "#183C30",
          }}
        >
          {!post ? (
            <T style={{ color: "white", padding: 24, textAlign: "center" }}>
              This moment is no longer available.
            </T>
          ) : post.media ? (
            post.mediaType === "video" ? (
              <View style={{ width: "100%" }}>
                <Video uri={post.media} />
                <T
                  style={{
                    color: "#B9CEC0",
                    fontSize: 11,
                    textAlign: "center",
                    marginTop: 15,
                  }}
                >
                  Watch at your own pace, then continue.
                </T>
              </View>
            ) : (
              <Image
                source={{ uri: post.media }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="contain"
                accessibilityLabel={post.content || "A shared Circle photo"}
              />
            )
          ) : (
            <T
              style={{
                fontFamily: font.heading,
                fontSize: 26,
                lineHeight: 39,
                color: "white",
                padding: 36,
                textAlign: "center",
              }}
            >
              {post.content}
            </T>
          )}
          {finished && (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: "#102A24EB",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 30,
                  gap: 15,
                },
              ]}
            >
              <CheckCheck size={40} color="#BFD8A6" />
              <T
                style={{
                  fontFamily: font.heading,
                  fontSize: 27,
                  color: "white",
                  textAlign: "center",
                }}
              >
                A little closer.
              </T>
              <T style={{ color: "#BED0C3", textAlign: "center" }}>
                That’s your Circle, lately.
              </T>
              <Button
                onPress={() => {
                  setIndex(0);
                  setFinished(false);
                  setPaused(false);
                }}
              >
                Watch again
              </Button>
              <Button secondary onPress={onClose}>
                Back to your Circle
              </Button>
            </View>
          )}
        </View>
        {post?.media && (
          <T
            numberOfLines={3}
            style={{
              color: "#E8F0E8",
              fontSize: 13,
              lineHeight: 22,
              marginTop: 17,
              textAlign: "center",
            }}
          >
            {post.content}
          </T>
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 15,
          }}
        >
          <IconButton
            icon={ChevronLeft}
            label="Previous moment"
            color="white"
            onPress={() => {
              setFinished(false);
              setIndex(Math.max(0, index - 1));
            }}
          />
          <T style={{ fontSize: 11, color: "#BFD1C3" }}>
            {Math.min(index + 1, visible.length)} / {visible.length} moments
          </T>
          <IconButton
            icon={ChevronRight}
            label="Next moment"
            color="white"
            onPress={next}
          />
        </View>
      </View>
    </Modal>
  );
}
