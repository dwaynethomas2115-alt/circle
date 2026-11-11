import { StableImage } from "../ui/StableImage";
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Pressable,
  Modal,
  StyleSheet,
  Animated,
  useWindowDimensions,
  AppState,
  Platform,
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
import { getPostMedia } from "../lib/postMedia";
import { HighlightsPrints } from "./HighlightsPrints";
import { highlightFrames } from "./highlightsPresentation";
import { useReducedMotion } from "../ui/useReducedMotion";
export function HighlightsPanel({ circleId }: { circleId: string }) {
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
  const photos = summary.montage.flatMap((post) =>
    getPostMedia(post).flatMap((media, index) =>
      media.type === "image"
        ? [{ id: `${post.id}:${index}`, uri: media.uri, circleId }]
        : [],
    ),
  );
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
        ? "Your Highlights progress is saved. A little closer, just like that."
        : result.error || "Could not save your Highlights progress.",
    );
    setSaving(false);
  }
  return (
    <View
      style={{ gap: 22, maxWidth: 950, width: "100%", alignSelf: "center" }}
    >
      {!!features.error && <Banner text={features.error} />}
      {!!notice && <Banner text={notice} onDismiss={() => setNotice("")} />}
      <View testID="highlights-content">
        <Card style={styles.recapCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Play Highlights montage"
            disabled={!summary.montage.length}
            onPress={() => setOpen(true)}
            style={({ pressed }) => [
              styles.recapHero,
              width >= 800 && styles.recapHeroWide,
              pressed && { opacity: 0.88 },
            ]}
          >
            <View style={styles.printBackdrop}>
              <HighlightsPrints photos={photos} />
              <View
                style={[styles.momentBadge, { backgroundColor: theme.surface }]}
              >
                <Images size={12} color={theme.accent} />
                <T style={styles.badgeText}>
                  {summary.montage.length}{" "}
                  {summary.montage.length === 1 ? "memory" : "memories"}
                </T>
              </View>
            </View>
            <View style={styles.heroWords}>
              <T style={[styles.eyebrow, { color: theme.accent }]}>
                CIRCLE HIGHLIGHTS
              </T>
              <T accessibilityRole="header" style={styles.heroTitle}>
                Little moments.{"\n"}Lasting memories.
              </T>
              <T style={styles.heroDescription}>
                {summary.montage.length
                  ? "Your photos, videos and stories, gathered into one little reel."
                  : "Share a memory to start your Circle’s next reel."}
              </T>
              <View
                style={[
                  styles.playPill,
                  { backgroundColor: theme.accent },
                  !summary.montage.length && { opacity: 0.45 },
                ]}
              >
                <Play size={16} color="white" fill="white" />
                <T style={styles.playLabel}>Watch Highlights</T>
                <ArrowUpRight size={15} color="white" />
              </View>
            </View>
          </Pressable>
          <View style={styles.privateNote}>
            <LockKeyhole size={13} color={c.muted} />
            <T style={styles.privateNoteText}>
              Just for the people in this Circle · Albums play photo by photo
            </T>
          </View>
        </Card>
      </View>
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
                    <StableImage
                      uri={post.media}
                      circleId={circleId}
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
      <View testID="highlights-info">
        <Card
          style={{
            padding: width < 600 ? 20 : 24,
            backgroundColor: theme.surface,
            borderColor: c.line,
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
                  A FEW PAGES WORTH REVISITING
                </T>
              </View>
              <T
                style={{
                  fontFamily: font.editorial,
                  fontSize: width < 600 ? 25 : 29,
                  letterSpacing: -0.8,
                  lineHeight: 36,
                }}
              >
                Your Circle’s Highlights.
              </T>
              <T
                style={{
                  color: c.muted,
                  lineHeight: 23,
                  marginTop: 10,
                  maxWidth: 470,
                }}
              >
                {summary.total
                  ? `${summary.total} new ${summary.total === 1 ? "update" : "updates"} from your people since your last visit to Highlights.`
                  : "You’re up to date. Take another look at the moments that made your week."}
              </T>
            </View>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
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
              marginTop: 20,
            }}
          >
            {[
              {
                label: "New moments",
                value: summary.posts.length,
                icon: Images,
              },
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
                  minWidth: 115,
                  backgroundColor: "#F7F7F2",
                  padding: 16,
                  borderRadius: 12,
                  gap: 9,
                }}
              >
                <Icon size={17} color={theme.accent} />
                <T style={{ fontFamily: font.heading, fontSize: 25 }}>
                  {value}
                </T>
                <T style={{ fontSize: 11, color: c.muted }}>{label}</T>
              </View>
            ))}
          </View>
        </Card>
      </View>
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
            ? "Your Highlights progress is saved on this device."
            : "Your Highlights progress is private to your account."}{" "}
          Your next visit starts here.
        </T>
        <Button icon={CheckCheck} onPress={markRead} disabled={saving}>
          {saving ? "Saving…" : "Mark highlights seen"}
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
  const reduced = useReducedMotion();
  const [active, setActive] = useState(AppState.currentState === "active");
  const progress = useRef(new Animated.Value(0)).current;
  const entrance = useRef(new Animated.Value(1)).current;
  const visible = highlightFrames(posts, feed);
  const post = visible[index]?.post;
  const media = visible[index]?.attachment;
  const hasPost = !!post;
  const barStart = Math.max(0, Math.min(index - 5, visible.length - 12));
  const progressFrames = visible.slice(barStart, barStart + 12);
  const author = state.users.find((x) => x.id === post?.authorId);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => subscription.remove();
  }, []);
  const frameId = visible[index]?.id;
  useEffect(() => {
    entrance.stopAnimation();
    entrance.setValue(reduced ? 1 : 0);
    if (reduced) return;
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 240,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, frameId, reduced]);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      // Arrow keys belong to focused form fields, sliders and video controls.
      if (
        target?.closest(
          'input, textarea, select, video, [role="slider"], [contenteditable]:not([contenteditable="false"]), [data-testid="highlights-video"]',
        )
      )
        return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setFinished(false);
        setIndex((previous) => Math.max(0, previous - 1));
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (index < visible.length - 1) {
          setIndex(index + 1);
          setFinished(false);
        } else setFinished(true);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, visible.length, onClose]);
  useEffect(() => {
    progress.setValue(0);
    if (
      paused ||
      !active ||
      finished ||
      !hasPost ||
      media?.type === "video" ||
      reduced
    )
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
  }, [
    index,
    paused,
    active,
    finished,
    hasPost,
    frameId,
    media?.type,
    progress,
    reduced,
    visible.length,
  ]);
  function next() {
    setFinished(false);
    if (index < visible.length - 1) setIndex(index + 1);
    else setFinished(true);
  }
  return (
    <Modal
      visible
      transparent={false}
      animationType={reduced ? "none" : "fade"}
      onRequestClose={onClose}
    >
      <View
        testID="highlights-dialog"
        accessibilityViewIsModal
        style={styles.theater}
      >
        <View style={styles.theaterContent}>
          <View style={{ flexDirection: "row", gap: 5, marginBottom: 17 }}>
            {progressFrames.map((frame, offset) => {
              const i = barStart + offset;
              return (
                <View
                  key={`${frame.post.id}:${frame.photoIndex}`}
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
                      style={{
                        height: 3,
                        backgroundColor: "white",
                        width: "100%",
                      }}
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
              );
            })}
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
              <T
                style={{ fontFamily: font.bold, color: "white", fontSize: 13 }}
              >
                {circleName}
              </T>
              <T style={{ fontSize: 11, color: "#BED0C3" }}>
                {author?.name || "Your people"}
              </T>
            </View>
            {media?.type !== "video" && (
              <IconButton
                icon={paused ? Play : Pause}
                label={paused ? "Resume Highlights" : "Pause Highlights"}
                color="white"
                onPress={() => setPaused(!paused)}
              />
            )}
            <IconButton
              icon={X}
              label="Close Highlights"
              onPress={onClose}
              color="white"
            />
          </View>
          <Animated.View
            testID="highlights-frame"
            style={[
              styles.stage,
              {
                opacity: entrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.6, 1],
                }),
                transform: [
                  { perspective: 1000 },
                  {
                    rotateY: entrance.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["7deg", "0deg"],
                    }),
                  },
                  {
                    translateX: entrance.interpolate({
                      inputRange: [0, 1],
                      outputRange: [18, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {!post ? (
              <T style={{ color: "white", padding: 24, textAlign: "center" }}>
                This moment is no longer available.
              </T>
            ) : media ? (
              media.type === "video" ? (
                <View testID="highlights-video" style={{ width: "100%" }}>
                  <Video uri={media.uri} />
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
                <StableImage
                  uri={media.uri}
                  circleId={post.circleId}
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
          </Animated.View>
          {post && media && (
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
            <View style={{ alignItems: "center", gap: 5 }}>
              <T
                accessibilityLiveRegion="polite"
                style={{
                  fontSize: 12,
                  color: "#E7EEE8",
                  fontFamily: font.bold,
                }}
              >
                {Math.min(index + 1, visible.length)} / {visible.length} moments
              </T>
              <T style={{ fontSize: 10, color: "#BFD1C3" }}>
                {reduced
                  ? "Continue at your own pace"
                  : "A few pages from your Circle"}
              </T>
            </View>
            <IconButton
              icon={ChevronRight}
              label="Next moment"
              color="white"
              onPress={next}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  recapCard: { backgroundColor: "#F7F4EB", borderRadius: 22 },
  recapHero: { padding: 24, gap: 14, alignItems: "center" },
  recapHeroWide: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 34,
    padding: 30,
  },
  printBackdrop: {
    minHeight: 220,
    justifyContent: "center",
    alignItems: "center",
  },
  momentBadge: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: 12,
    minHeight: 28,
    borderRadius: 20,
    marginTop: -4,
    borderWidth: 1,
    borderColor: c.line,
  },
  badgeText: { fontSize: 11, fontFamily: font.medium, color: c.muted },
  heroWords: {
    flexShrink: 1,
    maxWidth: 300,
    gap: 12,
    alignItems: "flex-start",
  },
  eyebrow: { fontFamily: font.bold, fontSize: 10, letterSpacing: 1.6 },
  heroTitle: {
    fontFamily: font.editorial,
    fontSize: 36,
    lineHeight: 41,
    letterSpacing: -0.8,
  },
  heroDescription: { color: c.muted, fontSize: 13, lineHeight: 22 },
  playPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 28,
    minHeight: 46,
    paddingHorizontal: 19,
    marginTop: 3,
  },
  playLabel: { fontSize: 13, fontFamily: font.bold, color: "white" },
  privateNote: {
    paddingVertical: 13,
    paddingHorizontal: 19,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF70",
    borderTopWidth: 1,
    borderColor: "#263B360A",
  },
  privateNoteText: {
    fontSize: 11,
    lineHeight: 17,
    color: c.muted,
    flexShrink: 1,
  },
  theater: { flex: 1, backgroundColor: "#102A24", padding: 16, paddingTop: 28 },
  theaterContent: {
    flex: 1,
    width: "100%",
    maxWidth: 980,
    alignSelf: "center",
  },
  stage: {
    flex: 1,
    minHeight: 130,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: "#183C30",
  },
});
