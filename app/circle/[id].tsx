import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Image,
  Pressable,
  ScrollView,
  TextInput,
  Switch,
  useWindowDimensions,
  StyleSheet,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Lock,
  Users,
  MessageCircle,
  Settings,
  Plus,
  Send,
  Trash2,
  UserPlus,
  Check,
  X,
  Shield,
  LogOut,
  KeyRound,
  Flag,
  Video,
  CalendarDays,
  BarChart3,
  ArrowDownUp,
  BookOpen,
} from "lucide-react-native";
import { useCircle } from "../../src/state/CircleProvider";
import { visibleMessages } from "../../src/state/model";
import {
  T,
  Card,
  Avatar,
  Button,
  Field,
  Empty,
  Banner,
  IconButton,
  SectionTitle,
  CircleAvatar,
} from "../../src/ui/primitives";
import { PostCard } from "../../src/ui/PostCard";
import { colors as c, font } from "../../src/ui/theme";
import type { Result } from "../../src/types";
import { PollsPanel } from "../../src/features/PollsPanel";
import { useCircleFeatures } from "../../src/features/CircleFeaturesProvider";
import { CalendarPanel } from "../../src/features/CalendarPanel";
import { HighlightsPanel } from "../../src/features/HighlightsPanel";
import { ThemeEditor } from "../../src/features/ThemeEditor";
import { CircleRoom } from "../../src/features/room/CircleRoom";
import { useCircleTheme, themeTint } from "../../src/features/theme-context";
type Tab =
  "Feed" | "Highlights" | "Chat" | "Members" | "About" | "Settings" | "Reports";
type CircleSurface = "calendar" | "room" | null;
function dayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
function monthKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}
function conversationDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (dayKey(value) === dayKey(today.toISOString())) return "Today";
  today.setDate(today.getDate() - 1);
  if (dayKey(value) === dayKey(today.toISOString())) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== new Date().getFullYear()
      ? { year: "numeric" as const }
      : {}),
  });
}
const routeTabs: Record<string, Tab> = {
  feed: "Feed",
  chat: "Chat",
  highlights: "Highlights",
  "catch-up": "Highlights",
  catchup: "Highlights",
  polls: "Chat",
  members: "Members",
  about: "About",
  settings: "Settings",
  reports: "Reports",
};
// A new route scope gets fresh drafts, invitations, and async callbacks immediately.
export default function CircleDetailRoute() {
  const { id, tab, room } = useLocalSearchParams<{
    id: string;
    tab?: string;
    room?: string;
  }>();
  const requestedTab = room === "1" ? "room" : tab;
  return (
    <CircleDetail
      key={`${id}:${requestedTab || ""}`}
      id={id}
      initialTab={requestedTab}
    />
  );
}
function CircleDetail({ id, initialTab }: { id: string; initialTab?: string }) {
  const { state, user, feed, actions } = useCircle();
  const features = useCircleFeatures();
  const theme = useCircleTheme();
  const palette = {
    ...c,
    teal: theme.accent,
    ink: theme.ink,
    white: theme.surface,
    mint: themeTint(theme.accent, 0.08),
  };
  const { width, height } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>(
    routeTabs[initialTab?.toLowerCase() || ""] || "Feed",
  );
  const [surface, setSurface] = useState<CircleSurface>(
    initialTab?.toLowerCase() === "calendar"
      ? "calendar"
      : initialTab?.toLowerCase() === "room"
        ? "room"
        : null,
  );
  const [pollComposerOpen, setPollComposerOpen] = useState(
    initialTab?.toLowerCase() === "polls",
  );
  const [notice, setNotice] = useState("");
  const [message, setMessage] = useState("");
  const [memoryMonth, setMemoryMonth] = useState("all");
  const [oldestFirst, setOldestFirst] = useState(false);
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const circle = state.circles.find((x) => x.id === id);
  const membership = state.members.find(
    (x) => x.circleId === id && x.userId === user?.id,
  );
  const members = state.members.filter((x) => x.circleId === id);
  const compactConversation = !!membership && tab === "Chat";
  const isManager = membership && ["owner", "admin"].includes(membership.role);
  const isModerator =
    membership && ["owner", "admin", "moderator"].includes(membership.role);
  const pending = state.requests.filter(
    (x) => x.circleId === id && x.status === "pending",
  );
  const ownRequest = state.requests.find(
    (x) => x.circleId === id && x.userId === user?.id && x.status === "pending",
  );
  const posts = feed.filter((x) => x.circleId === id);
  const memoryMonths = [
    ...new Set(posts.map((post) => monthKey(post.createdAt))),
  ]
    .sort()
    .reverse();
  const journal = posts
    .filter(
      (post) =>
        memoryMonth === "all" || monthKey(post.createdAt) === memoryMonth,
    )
    .sort((a, b) =>
      oldestFirst
        ? Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
          a.id.localeCompare(b.id)
        : Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
          b.id.localeCompare(a.id),
    );
  const messages = visibleMessages(state, id || "");
  const timeline = [
    ...messages.map((message) => ({
      kind: "message" as const,
      id: message.id,
      createdAt: message.createdAt,
      message,
    })),
    ...features.polls
      .filter((poll) => poll.circleId === id)
      .map((poll) => ({
        kind: "poll" as const,
        id: poll.id,
        createdAt: poll.createdAt,
        poll,
      })),
  ].sort(
    (a, b) =>
      Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
  const circleReports = state.reports.filter((report) => {
    if (report.circleId) return report.circleId === id;
    if (report.targetType === "message")
      return (
        state.messages.find((x) => x.id === report.targetId)?.circleId === id
      );
    const postId =
      report.targetType === "comment"
        ? state.comments.find((x) => x.id === report.targetId)?.postId
        : report.targetId;
    return state.posts.find((x) => x.id === postId)?.circleId === id;
  });
  const [editName, setEditName] = useState(circle?.name || "");
  const [editDescription, setEditDescription] = useState(
    circle?.description || "",
  );
  const [discoverable, setDiscoverable] = useState(
    circle?.discoverable || false,
  );
  const [approval, setApproval] = useState(circle?.approvalRequired ?? true);
  const chatScroll = useRef<ScrollView>(null);
  const chatNearBottom = useRef(true);
  useEffect(() => {
    if (circle) {
      setEditName(circle.name);
      setEditDescription(circle.description);
      setDiscoverable(circle.discoverable);
      setApproval(circle.approvalRequired);
    }
  }, [circle]);
  async function handle(promise: Result | Promise<Result>, success: string) {
    const result = await promise;
    setNotice(
      result.ok
        ? success
        : result.error || "Something went wrong. Please try again.",
    );
    return result;
  }
  async function send() {
    if (!message.trim() || busy) return;
    setBusy(true);
    try {
      const result = await actions.sendMessage(id, message.trim());
      if (result.ok) {
        chatNearBottom.current = true;
        setMessage("");
        setTimeout(
          () => chatScroll.current?.scrollToEnd({ animated: true }),
          100,
        );
      } else setNotice(result.error || "Could not send your message.");
    } finally {
      setBusy(false);
    }
  }
  async function invitePeople() {
    const result = await handle(
      actions.createInvitation(id),
      "Your invitation is ready. Share this code privately.",
    );
    if (result.ok) setInvite(result.code || "");
  }
  async function joinCircle() {
    if (!circle) return;
    const result = await actions.requestJoin(id);
    const joined =
      result.code === "joined" || (!result.code && !circle.approvalRequired);
    setNotice(
      result.ok
        ? joined
          ? `You’re in! Welcome to ${circle.name}.`
          : "Your request has been sent to the Circle admins."
        : result.error || "Unable to join this Circle.",
    );
  }
  async function transferOwnership(targetId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await handle(
        actions.setRole(id, targetId, "owner"),
        "Ownership transferred. You are now an admin of this Circle.",
      );
      if (result.ok) setTransferTarget(null);
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    const result = await handle(
      actions.leaveCircle(id),
      "You left this Circle.",
    );
    if (result.ok) router.replace("/circles");
    setLeaveConfirm(false);
  }
  if (!circle)
    return (
      <Empty
        title="A private little space"
        body="This Circle is unavailable, or you don't have access to it."
      >
        <Button onPress={() => router.push("/circles")}>Back to Circles</Button>
      </Empty>
    );
  return (
    <View style={{ gap: compactConversation ? 14 : 26 }}>
      {!compactConversation && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <IconButton
            icon={ArrowLeft}
            label="Back to Circles"
            onPress={() => router.push("/circles")}
          />
          <T style={{ color: palette.muted, fontSize: 11, letterSpacing: 0.7 }}>
            YOUR CIRCLES / {circle.category.toUpperCase()}
          </T>
        </View>
      )}
      <Card>
        {compactConversation ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: width < 650 ? 7 : 12,
              paddingHorizontal: width < 650 ? 12 : 20,
              paddingVertical: 13,
            }}
          >
            <IconButton
              icon={ArrowLeft}
              label="Back to Circles"
              onPress={() => router.push("/circles")}
              size={18}
              style={{ width: 28, height: 36 }}
            />
            <CircleAvatar
              avatar={circle.avatar}
              color={circle.color}
              size={34}
            />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <T
                numberOfLines={1}
                style={{
                  fontFamily: font.editorial,
                  fontSize: width < 650 ? 21 : 26,
                  letterSpacing: -0.4,
                }}
              >
                {circle.name}
              </T>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
              >
                <Lock size={10} color={palette.muted} />
                <T
                  numberOfLines={1}
                  style={{ fontSize: 10, color: palette.muted }}
                >
                  Private · {members.length}{" "}
                  {members.length === 1 ? "member" : "members"}
                </T>
              </View>
            </View>
            {width < 650 ? (
              <>
                <IconButton
                  icon={Video}
                  label="Join room"
                  onPress={() => setSurface("room")}
                  color={palette.teal}
                  size={19}
                  style={{
                    width: 34,
                    height: 38,
                    backgroundColor: palette.mint,
                    borderRadius: 11,
                  }}
                />
                <IconButton
                  icon={CalendarDays}
                  label="Calendar"
                  onPress={() => setSurface("calendar")}
                  color={palette.teal}
                  size={18}
                  style={{ width: 34, height: 38 }}
                />
              </>
            ) : (
              <>
                <Button
                  secondary
                  icon={Video}
                  onPress={() => setSurface("room")}
                >
                  Join room
                </Button>
                <Button
                  secondary
                  icon={CalendarDays}
                  onPress={() => setSurface("calendar")}
                >
                  Calendar
                </Button>
              </>
            )}
          </View>
        ) : (
          <>
            <View
              style={{
                height: width < 650 ? 140 : 220,
                backgroundColor: circle.color,
                overflow: "hidden",
              }}
            >
              {circle.cover ? (
                <Image
                  source={{ uri: circle.cover }}
                  style={{ height: "100%", width: "100%" }}
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View style={s.coverRing} />
                  <Users size={65} color="#FFFFFFAA" />
                </View>
              )}
              <View style={s.privacyTag}>
                <Lock size={12} color="white" />
                <T
                  style={{
                    color: "white",
                    fontSize: 10,
                    fontFamily: font.bold,
                    letterSpacing: 1,
                  }}
                >
                  PRIVATE CIRCLE
                </T>
              </View>
            </View>
            <View style={{ padding: width < 650 ? 22 : 28, gap: 16 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 15,
                  flexWrap: "wrap",
                }}
              >
                <View style={{ flex: 1, minWidth: 170, gap: 8 }}>
                  <T
                    style={{
                      fontSize: width < 650 ? 29 : 38,
                      fontFamily: font.editorial,
                      letterSpacing: -0.8,
                    }}
                  >
                    {circle.name}
                  </T>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <T
                      style={{
                        color: palette.teal,
                        fontFamily: font.bold,
                        fontSize: 11,
                      }}
                    >
                      {circle.category}
                    </T>
                    <T style={{ color: "#CCD5CE" }}>·</T>
                    <Lock size={11} color={palette.muted} />
                    <T style={{ color: palette.muted, fontSize: 11 }}>
                      Private Circle
                    </T>
                    {membership && (
                      <>
                        <T style={{ color: "#CCD5CE" }}>·</T>
                        <T style={{ color: palette.muted, fontSize: 11 }}>
                          {members.length}{" "}
                          {members.length === 1 ? "member" : "members"}
                        </T>
                      </>
                    )}
                  </View>
                </View>
                {membership ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      maxWidth: "100%",
                    }}
                  >
                    <Button
                      secondary
                      icon={MessageCircle}
                      onPress={() => {
                        setSurface(null);
                        chatNearBottom.current = true;
                        setTab("Chat");
                      }}
                    >
                      Group chat
                    </Button>
                    <Button
                      secondary
                      icon={Video}
                      onPress={() => setSurface("room")}
                    >
                      Join room
                    </Button>
                    <Button
                      secondary
                      icon={CalendarDays}
                      onPress={() => setSurface("calendar")}
                    >
                      Calendar
                    </Button>
                    <Button
                      icon={Plus}
                      onPress={() =>
                        router.push({
                          pathname: "/create",
                          params: { circleId: id },
                        })
                      }
                    >
                      Share a moment
                    </Button>
                  </View>
                ) : (
                  <Button
                    icon={ownRequest ? Check : UserPlus}
                    disabled={!!ownRequest || !circle.discoverable}
                    onPress={joinCircle}
                  >
                    {ownRequest
                      ? "Request pending"
                      : circle.discoverable
                        ? circle.approvalRequired
                          ? "Request to join"
                          : "Join Circle"
                        : "Invitation only"}
                  </Button>
                )}
              </View>
              {!!circle.description && (
                <T
                  style={{
                    color: palette.muted,
                    fontSize: 14,
                    lineHeight: 24,
                    maxWidth: 650,
                  }}
                >
                  {circle.description}
                </T>
              )}
              {membership && (
                <View style={s.storyMeta}>
                  <BookOpen size={14} color={palette.teal} />
                  <T style={{ fontSize: 11, color: palette.muted }}>
                    A shared story since{" "}
                    {new Date(circle.createdAt).toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}
                  </T>
                </View>
              )}
            </View>
          </>
        )}
        {membership && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ borderTopWidth: 1, borderColor: palette.line }}
            contentContainerStyle={{ paddingHorizontal: width < 650 ? 8 : 20 }}
          >
            {(
              [
                "Feed",
                "Highlights",
                "Chat",
                "Members",
                "About",
                ...(isModerator ? ["Reports"] : []),
                ...(isManager ? ["Settings"] : []),
              ] as Tab[]
            ).map((label) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: !surface && tab === label }}
                aria-selected={!surface && tab === label}
                key={label}
                onPress={() => {
                  setSurface(null);
                  if (label === "Chat") chatNearBottom.current = true;
                  setTab(label);
                }}
                style={{
                  paddingHorizontal: width < 650 ? 12 : 20,
                  paddingVertical: 17,
                  borderBottomWidth: 2,
                  borderColor:
                    !surface && tab === label ? palette.teal : "transparent",
                }}
              >
                <View
                  style={{ flexDirection: "row", gap: 7, alignItems: "center" }}
                >
                  {label === "Chat" ? (
                    <MessageCircle
                      size={15}
                      color={
                        !surface && tab === label ? palette.teal : palette.muted
                      }
                    />
                  ) : label === "Members" ? (
                    <Users
                      size={15}
                      color={
                        !surface && tab === label ? palette.teal : palette.muted
                      }
                    />
                  ) : label === "Settings" ? (
                    <Settings
                      size={15}
                      color={
                        !surface && tab === label ? palette.teal : palette.muted
                      }
                    />
                  ) : null}
                  <T
                    style={{
                      fontSize: 12,
                      fontFamily: font.bold,
                      color:
                        !surface && tab === label
                          ? palette.teal
                          : palette.muted,
                    }}
                  >
                    {label}
                    {label === "Members" && pending.length && isManager
                      ? ` (${pending.length})`
                      : ""}
                  </T>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Card>
      {notice ? <Banner text={notice} onDismiss={() => setNotice("")} /> : null}
      {invite && membership && (
        <Card
          style={{
            padding: 24,
            gap: 12,
            borderColor: "#C4DFCF",
            backgroundColor: "#F1F7F1",
          }}
        >
          <View style={{ flexDirection: "row", gap: 9, alignItems: "center" }}>
            <KeyRound size={18} color={palette.teal} />
            <T style={{ fontFamily: font.bold }}>A seat in your Circle</T>
          </View>
          <T
            selectable
            style={{
              fontSize: 23,
              fontFamily: font.heading,
              letterSpacing: 2,
              color: palette.teal,
            }}
          >
            {invite}
          </T>
          <T style={{ color: palette.muted, fontSize: 12 }}>
            Share this invitation privately. It expires in 7 days and can be
            used once.
          </T>
        </Card>
      )}
      {!membership ? (
        <Empty
          title="The good stuff stays inside."
          body={
            ownRequest
              ? "Your request is being reviewed. We’ll let you know when you’re in."
              : "Photos, conversations, and the everyday moments shared here are only visible to approved members."
          }
        >
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Lock size={14} color={palette.teal} />
            <T style={{ color: palette.teal, fontSize: 12 }}>
              Private by design
            </T>
          </View>
        </Empty>
      ) : (
        <>
          {surface && (
            <View style={{ gap: 20 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 14,
                  flexWrap: "wrap",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  {surface === "calendar" ? (
                    <CalendarDays size={22} color={palette.teal} />
                  ) : (
                    <Video size={22} color={palette.teal} />
                  )}
                  <T style={{ fontFamily: font.heading, fontSize: 23 }}>
                    {surface === "calendar" ? "Circle calendar" : "Circle room"}
                  </T>
                </View>
                <Button
                  secondary
                  icon={ArrowLeft}
                  onPress={() => setSurface(null)}
                >
                  Back to Circle
                </Button>
              </View>
              {surface === "calendar" && <CalendarPanel circleId={id} />}
            </View>
          )}
          {!surface && tab === "Highlights" && (
            <HighlightsPanel circleId={id} />
          )}
          {surface === "room" && (
            <CircleRoom
              circleId={id}
              circleName={circle.name}
              onClose={() => setSurface(null)}
            />
          )}
          {!surface && tab === "Feed" && (
            <View style={s.journal}>
              <View style={s.journalHeading}>
                <View style={{ gap: 6 }}>
                  <T style={{ fontFamily: font.heading, fontSize: 21 }}>
                    Circle journal
                  </T>
                  <T style={{ fontSize: 12, color: palette.muted }}>
                    Photos, stories, and the days between.
                  </T>
                </View>
                {posts.length > 1 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Change moment order"
                    onPress={() => setOldestFirst(!oldestFirst)}
                    style={[
                      s.sortButton,
                      {
                        borderColor: palette.line,
                        backgroundColor: palette.white,
                      },
                    ]}
                  >
                    <ArrowDownUp size={14} color={palette.teal} />
                    <T style={{ fontSize: 11, color: palette.ink }}>
                      {oldestFirst ? "Oldest first" : "Newest first"}
                    </T>
                  </Pressable>
                )}
              </View>
              {posts.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingBottom: 5 }}
                  style={{ flexGrow: 0 }}
                >
                  {[
                    { key: "all", label: "All moments" },
                    ...memoryMonths.map((key) => ({
                      key,
                      label: monthLabel(key),
                    })),
                  ].map(({ key, label }) => (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityLabel={`Show ${label.toLowerCase()}`}
                      accessibilityState={{ selected: memoryMonth === key }}
                      onPress={() => setMemoryMonth(key)}
                      style={[
                        s.monthChip,
                        {
                          backgroundColor:
                            memoryMonth === key ? palette.ink : palette.white,
                          borderColor:
                            memoryMonth === key ? palette.ink : palette.line,
                        },
                      ]}
                    >
                      <T
                        style={{
                          fontSize: 11,
                          color: memoryMonth === key ? "white" : palette.muted,
                          fontFamily:
                            memoryMonth === key ? font.bold : font.medium,
                        }}
                      >
                        {label}
                      </T>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {journal.map((post, index) => (
                <View key={post.id}>
                  {(index === 0 ||
                    monthKey(post.createdAt) !==
                      monthKey(journal[index - 1].createdAt)) && (
                    <View style={s.chapterHeading}>
                      <T
                        style={{
                          fontFamily: font.medium,
                          color: palette.muted,
                          fontSize: 11,
                          letterSpacing: 0.4,
                        }}
                      >
                        {monthLabel(monthKey(post.createdAt))}
                      </T>
                      <View
                        style={{
                          flex: 1,
                          height: 1,
                          backgroundColor: palette.line,
                        }}
                      />
                    </View>
                  )}
                  <PostCard post={post} />
                </View>
              ))}
              {!!posts.length && (
                <View style={s.journalFootnote}>
                  <Lock size={12} color={palette.muted} />
                  <T
                    style={{
                      fontSize: 11,
                      color: palette.muted,
                      textAlign: "center",
                      lineHeight: 18,
                    }}
                  >
                    Browse the moments currently loaded in your Circle.
                  </T>
                </View>
              )}
              {!posts.length && (
                <Empty
                  title="Your first chapter starts here."
                  body="A favorite photo, a story from today, a simple hello. Keep the first moment in your Circle."
                >
                  <Button
                    icon={Plus}
                    onPress={() =>
                      router.push({
                        pathname: "/create",
                        params: { circleId: id },
                      })
                    }
                  >
                    Create the first post
                  </Button>
                </Empty>
              )}
            </View>
          )}
          {tab === "Chat" && (
            <View style={{ display: surface ? "none" : "flex" }}>
              <Card
                style={{
                  maxWidth: 850,
                  width: "100%",
                  alignSelf: "center",
                  borderRadius: 20,
                }}
              >
                <View
                  style={{
                    padding: width < 650 ? 12 : 24,
                    borderBottomWidth: 1,
                    borderColor: palette.line,
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  {width >= 650 && (
                    <View
                      style={{
                        height: 42,
                        width: 42,
                        borderRadius: 14,
                        backgroundColor: palette.mint,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <MessageCircle size={21} color={palette.teal} />
                    </View>
                  )}
                  <View style={{ gap: 4, flex: 1, minWidth: 0 }}>
                    <T
                      numberOfLines={1}
                      style={{
                        fontFamily: font.heading,
                        fontSize: width < 650 ? 15 : 17,
                      }}
                    >
                      The conversation
                    </T>
                    {width >= 650 && (
                      <T style={{ fontSize: 11, color: palette.muted }}>
                        {members.length}{" "}
                        {members.length === 1 ? "person" : "people"} · Only this
                        Circle
                      </T>
                    )}
                  </View>
                  <Button
                    secondary
                    icon={pollComposerOpen ? X : BarChart3}
                    style={{
                      marginLeft: "auto",
                      ...(width < 650
                        ? { paddingHorizontal: 10, paddingVertical: 9 }
                        : {}),
                    }}
                    onPress={() => setPollComposerOpen(!pollComposerOpen)}
                  >
                    {pollComposerOpen ? "Cancel poll" : "Compose poll"}
                  </Button>
                </View>
                {features.error && (
                  <View style={{ paddingHorizontal: 20 }}>
                    <Banner text={features.error} />
                  </View>
                )}
                {pollComposerOpen && (
                  <View
                    style={{
                      padding: width < 650 ? 12 : 20,
                      backgroundColor: palette.mint,
                    }}
                  >
                    <PollsPanel
                      circleId={id}
                      embedded
                      composerOpen
                      onComposerClose={() => {
                        setPollComposerOpen(false);
                        chatNearBottom.current = true;
                        setTimeout(
                          () =>
                            chatScroll.current?.scrollToEnd({ animated: true }),
                          100,
                        );
                      }}
                      hidePolls
                    />
                  </View>
                )}
                <ScrollView
                  ref={chatScroll}
                  style={{
                    height:
                      width < 650
                        ? Math.max(240, Math.min(420, height - 480))
                        : 520,
                    backgroundColor: "#FAF9F6",
                  }}
                  contentContainerStyle={{
                    padding: width < 650 ? 16 : 28,
                    gap: 5,
                  }}
                  onScroll={({ nativeEvent }) => {
                    if (surface) return;
                    chatNearBottom.current =
                      nativeEvent.contentOffset.y +
                        nativeEvent.layoutMeasurement.height >=
                      nativeEvent.contentSize.height - 80;
                  }}
                  scrollEventThrottle={100}
                  onContentSizeChange={() => {
                    if (!surface && chatNearBottom.current)
                      chatScroll.current?.scrollToEnd({ animated: true });
                  }}
                >
                  {!timeline.length && (
                    <View
                      style={{ padding: 40, gap: 12, alignItems: "center" }}
                    >
                      <MessageCircle color={palette.muted} size={32} />
                      <T style={{ color: palette.muted, textAlign: "center" }}>
                        Say the first hello.
                      </T>
                    </View>
                  )}
                  {timeline.map((item, index) => {
                    const previous = timeline[index - 1];
                    const showDate =
                      !previous ||
                      dayKey(previous.createdAt) !== dayKey(item.createdAt);
                    const dateDivider = showDate ? (
                      <View style={s.chatDate}>
                        <View
                          style={{
                            height: 1,
                            flex: 1,
                            backgroundColor: palette.line,
                          }}
                        />
                        <T
                          style={{
                            fontSize: 10,
                            fontFamily: font.medium,
                            color: palette.muted,
                          }}
                        >
                          {conversationDate(item.createdAt)}
                        </T>
                        <View
                          style={{
                            height: 1,
                            flex: 1,
                            backgroundColor: palette.line,
                          }}
                        />
                      </View>
                    ) : null;
                    if (item.kind === "poll")
                      return (
                        <View
                          key={`poll-${item.id}`}
                          style={{ width: "100%", marginVertical: 10 }}
                        >
                          {dateDivider}
                          <PollsPanel circleId={id} pollId={item.id} embedded />
                        </View>
                      );
                    const msg = item.message;
                    const author = state.users.find(
                      (person) => person.id === msg.authorId,
                    );
                    const own = msg.authorId === user?.id;
                    const grouped =
                      !showDate &&
                      previous?.kind === "message" &&
                      previous.message.authorId === msg.authorId &&
                      Date.parse(msg.createdAt) -
                        Date.parse(previous.createdAt) <
                        300_000;
                    return (
                      <View key={msg.id}>
                        {dateDivider}
                        <View
                          style={{
                            flexDirection: own ? "row-reverse" : "row",
                            gap: 10,
                            alignItems: "flex-start",
                            marginTop: grouped ? 0 : 12,
                          }}
                        >
                          {!own && (
                            <View style={{ width: 32, paddingTop: 18 }}>
                              {!grouped && (
                                <Avatar
                                  uri={author?.avatar}
                                  name={author?.name || "Circle member"}
                                  size={30}
                                />
                              )}
                            </View>
                          )}
                          <View
                            style={{
                              maxWidth: width < 650 ? "85%" : "76%",
                              minWidth: 90,
                              gap: 5,
                              alignItems: own ? "flex-end" : "flex-start",
                            }}
                          >
                            {!own && !grouped && (
                              <T
                                style={{
                                  fontSize: 11,
                                  fontFamily: font.bold,
                                  color: palette.muted,
                                  paddingLeft: 3,
                                }}
                              >
                                {author?.name || "Circle member"}
                              </T>
                            )}
                            <View
                              style={{
                                paddingHorizontal: 15,
                                paddingVertical: 11,
                                borderRadius: 16,
                                borderTopRightRadius: own
                                  ? grouped
                                    ? 6
                                    : 16
                                  : 16,
                                borderTopLeftRadius: !own && grouped ? 6 : 16,
                                backgroundColor: own
                                  ? palette.teal
                                  : palette.white,
                                borderWidth: own ? 0 : 1,
                                borderColor: palette.line,
                              }}
                            >
                              <T
                                style={{
                                  color: own ? "white" : palette.ink,
                                  fontSize: 14,
                                  lineHeight: 22,
                                }}
                              >
                                {msg.content}
                              </T>
                            </View>
                            <View
                              style={{
                                flexDirection: "row",
                                gap: 8,
                                alignItems: "center",
                                paddingHorizontal: 3,
                              }}
                            >
                              <T style={{ fontSize: 10, color: palette.muted }}>
                                {new Date(msg.createdAt).toLocaleTimeString(
                                  [],
                                  { hour: "numeric", minute: "2-digit" },
                                )}
                              </T>
                              {(own || isModerator) && (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel="Delete message"
                                  hitSlop={10}
                                  style={{ padding: 4 }}
                                  onPress={() =>
                                    handle(
                                      actions.deleteMessage(msg.id),
                                      "Message deleted.",
                                    )
                                  }
                                >
                                  <Trash2 size={11} color={palette.muted} />
                                </Pressable>
                              )}
                              {!own && (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel="Report message"
                                  hitSlop={10}
                                  style={{ padding: 4 }}
                                  onPress={() =>
                                    handle(
                                      actions.report(
                                        "message",
                                        msg.id,
                                        "Reported by a Circle member",
                                      ),
                                      "Thanks. Your report has been sent to Circle moderators.",
                                    )
                                  }
                                >
                                  <Flag size={11} color={palette.muted} />
                                </Pressable>
                              )}
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
                <View
                  style={{
                    margin: width < 650 ? 12 : 18,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: palette.line,
                    backgroundColor: palette.white,
                    padding: 10,
                    paddingLeft: 15,
                    flexDirection: "row",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <TextInput
                    accessibilityLabel="Message your Circle"
                    placeholder="Message your Circle…"
                    placeholderTextColor="#98A39E"
                    value={message}
                    onChangeText={setMessage}
                    maxLength={4000}
                    onSubmitEditing={send}
                    style={{
                      flex: 1,
                      fontFamily: font.regular,
                      fontSize: 14,
                      minWidth: 0,
                      color: palette.ink,
                      paddingVertical: 8,
                    }}
                  />
                  <Button
                    icon={Send}
                    disabled={!message.trim() || busy}
                    onPress={send}
                  >
                    Send
                  </Button>
                </View>
              </Card>
            </View>
          )}
          {!surface && tab === "Members" && (
            <View style={{ gap: 24 }}>
              {isManager && pending.length > 0 && (
                <Card style={{ padding: 24, gap: 16 }}>
                  <SectionTitle title="A few new faces" />
                  <T
                    style={{
                      color: palette.muted,
                      fontSize: 12,
                      marginTop: -15,
                    }}
                  >
                    Review the people who would like to join your Circle.
                  </T>
                  {pending.map((request) => {
                    const person = state.users.find(
                      (x) => x.id === request.userId,
                    );
                    return (
                      <View
                        key={request.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          paddingVertical: 9,
                        }}
                      >
                        <Avatar
                          uri={person?.avatar}
                          name={person?.name || "New member"}
                        />
                        <View style={{ flex: 1, gap: 4 }}>
                          <T style={{ fontFamily: font.bold }}>
                            {person?.name || "New member"}
                          </T>
                          <T style={{ color: palette.muted, fontSize: 11 }}>
                            @{person?.username || "member"} · Requested to join
                          </T>
                        </View>
                        <IconButton
                          icon={X}
                          label={`Reject ${person?.name || "request"}`}
                          onPress={() =>
                            handle(
                              actions.respondRequest(request.id, false),
                              "Membership request declined.",
                            )
                          }
                        />
                        <Button
                          icon={Check}
                          onPress={() =>
                            handle(
                              actions.respondRequest(request.id, true),
                              "Welcome to the Circle. Membership approved!",
                            )
                          }
                        >
                          Approve
                        </Button>
                      </View>
                    );
                  })}
                </Card>
              )}
              <Card style={{ padding: 24, gap: 20 }}>
                <SectionTitle
                  title={`The people who make it yours (${members.length})`}
                  action={isManager ? "Invite someone" : undefined}
                  onPress={invitePeople}
                />
                {members.map((member) => {
                  const person = state.users.find(
                    (x) => x.id === member.userId,
                  );
                  const canEdit =
                    isManager &&
                    member.role !== "owner" &&
                    member.userId !== user?.id &&
                    (membership.role === "owner" || member.role !== "admin");
                  return (
                    <View
                      key={member.userId}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        borderBottomWidth: 1,
                        borderColor: palette.line,
                        paddingBottom: 17,
                        flexWrap: "wrap",
                      }}
                    >
                      <Avatar
                        uri={person?.avatar}
                        name={person?.name || "Circle member"}
                        size={43}
                      />
                      <View style={{ flex: 1, minWidth: 120, gap: 4 }}>
                        <T style={{ fontFamily: font.bold }}>
                          {person?.name || "Circle member"}
                          {member.userId === user?.id ? " (you)" : ""}
                        </T>
                        <T style={{ fontSize: 11, color: palette.muted }}>
                          @{person?.username || "member"}
                        </T>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                          backgroundColor:
                            member.role === "owner" ? palette.mint : "#F4F5F2",
                          borderRadius: 15,
                          paddingVertical: 6,
                          paddingHorizontal: 11,
                        }}
                      >
                        {member.role !== "member" && (
                          <Shield size={11} color={palette.teal} />
                        )}
                        <T
                          style={{
                            fontSize: 10,
                            color:
                              member.role === "owner"
                                ? palette.teal
                                : palette.muted,
                            textTransform: "capitalize",
                          }}
                        >
                          {member.role}
                        </T>
                      </View>
                      {canEdit && (
                        <View
                          style={{
                            flexDirection: "row",
                            gap: 5,
                            flexWrap: "wrap",
                            maxWidth: "100%",
                          }}
                        >
                          {membership.role === "owner" && (
                            <Button
                              secondary
                              onPress={() =>
                                handle(
                                  actions.setRole(
                                    id,
                                    member.userId,
                                    member.role === "member"
                                      ? "moderator"
                                      : member.role === "moderator" &&
                                          membership.role === "owner"
                                        ? "admin"
                                        : "member",
                                  ),
                                  "Member role updated.",
                                )
                              }
                            >
                              {member.role === "member"
                                ? "Make moderator"
                                : member.role === "moderator" &&
                                    membership.role === "owner"
                                  ? "Make admin"
                                  : "Make member"}
                            </Button>
                          )}
                          {membership.role === "owner" && (
                            <Button
                              secondary
                              icon={Shield}
                              onPress={() => setTransferTarget(member.userId)}
                            >
                              Transfer ownership
                            </Button>
                          )}
                          <IconButton
                            icon={X}
                            label={`Remove ${person?.name || "member"}`}
                            color={palette.red}
                            onPress={() =>
                              handle(
                                actions.removeMember(id, member.userId),
                                "Member removed. Their Circle access has been revoked.",
                              )
                            }
                          />
                        </View>
                      )}
                      {transferTarget === member.userId &&
                        membership.role === "owner" && (
                          <View
                            style={{
                              width: "100%",
                              padding: 16,
                              backgroundColor: "#F9F4EC",
                              borderRadius: 12,
                              gap: 12,
                            }}
                          >
                            <T style={{ fontFamily: font.bold, fontSize: 13 }}>
                              Make {person?.name || "this member"} the Circle
                              owner?
                            </T>
                            <T
                              style={{
                                fontSize: 12,
                                color: palette.muted,
                                lineHeight: 20,
                              }}
                            >
                              You will become an admin. Only the new owner will
                              be able to transfer ownership back to you.
                            </T>
                            <View
                              style={{
                                flexDirection: "row",
                                gap: 10,
                                flexWrap: "wrap",
                              }}
                            >
                              <Button
                                disabled={busy}
                                onPress={() => transferOwnership(member.userId)}
                              >
                                {busy
                                  ? "Transferring…"
                                  : "Confirm ownership transfer"}
                              </Button>
                              <Button
                                secondary
                                disabled={busy}
                                onPress={() => setTransferTarget(null)}
                              >
                                Cancel
                              </Button>
                            </View>
                          </View>
                        )}
                    </View>
                  );
                })}
              </Card>
            </View>
          )}
          {!surface && tab === "About" && (
            <Card
              style={{
                padding: 30,
                maxWidth: 750,
                width: "100%",
                alignSelf: "center",
                gap: 24,
              }}
            >
              <View style={{ gap: 12 }}>
                <T style={{ fontFamily: font.heading, fontSize: 22 }}>
                  A space for us.
                </T>
                <T style={{ color: palette.muted, lineHeight: 25 }}>
                  {circle.description ||
                    "The little moments are better together. This is your shared space to connect, catch up, and feel a little closer."}
                </T>
              </View>
              <View style={s.aboutRow}>
                <Users color={palette.teal} size={19} />
                <View style={{ gap: 5 }}>
                  <T style={{ fontFamily: font.bold }}>
                    {circle.category} Circle
                  </T>
                  <T style={{ fontSize: 12, color: palette.muted }}>
                    {members.length} people, one shared space
                  </T>
                </View>
              </View>
              <View style={s.aboutRow}>
                <Lock color={palette.teal} size={19} />
                <View style={{ gap: 5, flex: 1 }}>
                  <T style={{ fontFamily: font.bold }}>
                    Private to approved members
                  </T>
                  <T
                    style={{
                      fontSize: 12,
                      color: palette.muted,
                      lineHeight: 20,
                    }}
                  >
                    Only members can see posts, photos, and conversations.{" "}
                    {circle.discoverable
                      ? "People can discover the Circle and request access."
                      : "New people can join with a private invitation."}
                  </T>
                </View>
              </View>
              <T style={{ color: palette.muted, fontSize: 11 }}>
                Created{" "}
                {new Date(circle.createdAt).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </T>
              {membership.role === "owner" ? (
                <T
                  style={{ fontSize: 12, color: palette.muted, lineHeight: 20 }}
                >
                  You own this Circle. Transfer ownership to another member from
                  the Members tab before leaving.
                </T>
              ) : leaveConfirm ? (
                <View
                  style={{
                    gap: 12,
                    paddingTop: 15,
                    borderTopWidth: 1,
                    borderColor: palette.line,
                  }}
                >
                  <T style={{ color: palette.red }}>
                    Leave this Circle? You will lose access to its posts and
                    chat.
                  </T>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Button onPress={leave}>Yes, leave Circle</Button>
                    <Button secondary onPress={() => setLeaveConfirm(false)}>
                      Stay here
                    </Button>
                  </View>
                </View>
              ) : (
                <Button
                  icon={LogOut}
                  secondary
                  onPress={() => setLeaveConfirm(true)}
                >
                  Leave this Circle
                </Button>
              )}
            </Card>
          )}
          {!surface && tab === "Reports" && isModerator && (
            <Card style={{ padding: width < 650 ? 20 : 28, gap: 20 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Shield size={22} color={palette.teal} />
                <View style={{ flex: 1, gap: 6 }}>
                  <T style={{ fontFamily: font.heading, fontSize: 20 }}>
                    Look after your Circle
                  </T>
                  <T
                    style={{
                      color: palette.muted,
                      fontSize: 12,
                      lineHeight: 19,
                    }}
                  >
                    Review content flagged by your members. Reports are only
                    visible to moderators and the person who submitted them.
                  </T>
                </View>
              </View>
              {!circleReports.length ? (
                <View style={{ padding: 35, alignItems: "center", gap: 12 }}>
                  <Check size={29} color={palette.teal} />
                  <T style={{ fontFamily: font.bold }}>
                    A little peace of mind.
                  </T>
                  <T
                    style={{
                      color: palette.muted,
                      textAlign: "center",
                      fontSize: 12,
                    }}
                  >
                    There are no reports in this Circle.
                  </T>
                </View>
              ) : (
                circleReports.map((report) => {
                  const target =
                    report.targetType === "post"
                      ? state.posts.find((x) => x.id === report.targetId)
                      : report.targetType === "comment"
                        ? state.comments.find((x) => x.id === report.targetId)
                        : state.messages.find((x) => x.id === report.targetId);
                  const reporter = state.users.find(
                    (x) => x.id === report.userId,
                  );
                  return (
                    <View
                      key={report.id}
                      style={{
                        paddingTop: 20,
                        borderTopWidth: 1,
                        borderColor: palette.line,
                        gap: 12,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <View
                          style={{
                            height: 31,
                            width: 31,
                            borderRadius: 11,
                            backgroundColor: "#F9F0E7",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Flag size={15} color={palette.orange} />
                        </View>
                        <View style={{ flex: 1, gap: 4 }}>
                          <T style={{ fontFamily: font.bold, fontSize: 12 }}>
                            Reported {report.targetType}
                          </T>
                          <T style={{ color: palette.muted, fontSize: 10 }}>
                            {reporter?.name || "Circle member"} ·{" "}
                            {new Date(report.createdAt).toLocaleDateString()}
                          </T>
                        </View>
                        <T
                          style={{
                            fontSize: 10,
                            color: target ? palette.orange : palette.muted,
                          }}
                        >
                          {target ? "Needs review" : "Content removed"}
                        </T>
                      </View>
                      <T style={{ lineHeight: 21, fontSize: 13 }}>
                        {report.reason}
                      </T>
                      {target && (
                        <View
                          style={{
                            padding: 15,
                            borderRadius: 10,
                            backgroundColor: "#F5F7F3",
                            gap: 7,
                          }}
                        >
                          <T
                            style={{
                              fontSize: 9,
                              color: palette.muted,
                              fontFamily: font.bold,
                              letterSpacing: 1,
                            }}
                          >
                            FLAGGED CONTENT
                          </T>
                          <T
                            style={{
                              fontSize: 13,
                              color: "#53665B",
                              lineHeight: 21,
                            }}
                          >
                            {target.content || "Media attachment"}
                          </T>
                        </View>
                      )}
                      {target && (
                        <View
                          style={{
                            flexDirection: "row",
                            gap: 9,
                            alignItems: "center",
                          }}
                        >
                          <Button
                            secondary
                            icon={Trash2}
                            onPress={() =>
                              handle(
                                report.targetType === "post"
                                  ? actions.deletePost(report.targetId)
                                  : report.targetType === "comment"
                                    ? actions.deleteComment(report.targetId)
                                    : actions.deleteMessage(report.targetId),
                                "Reported content has been removed from your Circle.",
                              )
                            }
                          >
                            Remove {report.targetType}
                          </Button>
                          <T
                            style={{
                              fontSize: 11,
                              color: palette.muted,
                              flex: 1,
                              lineHeight: 18,
                            }}
                          >
                            Removal is permanent.
                          </T>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </Card>
          )}
          {!surface && tab === "Settings" && isManager && (
            <View style={{ gap: 22 }}>
              <ThemeEditor circleId={id} />
              <Card
                style={{
                  padding: 28,
                  maxWidth: 750,
                  width: "100%",
                  alignSelf: "center",
                  gap: 12,
                }}
              >
                <SectionTitle title="Make this space your own" />
                <Field
                  label="Circle name"
                  value={editName}
                  onChangeText={setEditName}
                  maxLength={80}
                />
                <Field
                  label="Description"
                  value={editDescription}
                  onChangeText={setEditDescription}
                  multiline
                  maxLength={1000}
                />
                <View style={s.settingRow}>
                  <View style={{ flex: 1, gap: 5 }}>
                    <T style={{ fontFamily: font.bold }}>Discoverable Circle</T>
                    <T style={{ fontSize: 12, color: palette.muted }}>
                      Your Circle can be found. Content always stays private.
                    </T>
                  </View>
                  <Switch
                    accessibilityLabel="Discoverable Circle"
                    value={discoverable}
                    onValueChange={setDiscoverable}
                    trackColor={{ false: "#DAE3DC", true: palette.teal }}
                    thumbColor="white"
                  />
                </View>
                <View style={s.settingRow}>
                  <View style={{ flex: 1, gap: 5 }}>
                    <T style={{ fontFamily: font.bold }}>Approve new members</T>
                    <T style={{ fontSize: 12, color: palette.muted }}>
                      Review requests before people join.
                    </T>
                  </View>
                  <Switch
                    accessibilityLabel="Require membership approval"
                    value={approval}
                    onValueChange={setApproval}
                    trackColor={{ false: "#DAE3DC", true: palette.teal }}
                    thumbColor="white"
                  />
                </View>
                <Button
                  onPress={() =>
                    handle(
                      actions.updateCircle(id, {
                        name: editName.trim(),
                        description: editDescription.trim(),
                        discoverable,
                        approvalRequired: approval,
                      }),
                      "Your Circle settings have been saved.",
                    )
                  }
                >
                  Save Circle settings
                </Button>
                <Button secondary icon={UserPlus} onPress={invitePeople}>
                  Create a private invitation
                </Button>
              </Card>
            </View>
          )}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  storyMeta: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    paddingTop: 4,
  },
  journal: { maxWidth: 760, width: "100%", alignSelf: "center", gap: 18 },
  journalHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 14,
    paddingTop: 5,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: 18,
  },
  chapterHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingBottom: 18,
    paddingTop: 6,
  },
  journalFootnote: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  chatDate: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 18,
    paddingHorizontal: 15,
  },
  privacyTag: {
    position: "absolute",
    top: 18,
    left: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#203B397D",
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
  },
  coverRing: {
    position: "absolute",
    width: 270,
    height: 270,
    borderRadius: 135,
    borderWidth: 45,
    borderColor: "#FFFFFF20",
    right: -50,
    bottom: -140,
  },
  aboutRow: {
    flexDirection: "row",
    gap: 15,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderColor: c.line,
    alignItems: "center",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderColor: c.line,
  },
});
