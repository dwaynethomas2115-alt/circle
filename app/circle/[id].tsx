import { StableImage } from "../../src/ui/StableImage";
import React, { useState, useEffect, useRef } from "react";
import {
  View,
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
  Flag,
  Video,
  CalendarDays,
  BarChart3,
  SlidersHorizontal,
  BookOpen,
  Camera,
  MoreHorizontal,
  Info,
  Sparkles,
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
import { InviteSheet } from "../../src/ui/InviteSheet";
import { MemoryFiltersSheet } from "../../src/ui/MemoryFiltersSheet";
import { CircleCoverEditor } from "../../src/ui/CircleCoverEditor";
import {
  CircleOptionsSheet,
  type CircleOption,
} from "../../src/ui/CircleOptionsSheet";
import { colors as c, font } from "../../src/ui/theme";
import type { Result } from "../../src/types";
import { PollsPanel } from "../../src/features/PollsPanel";
import { useCircleFeatures } from "../../src/features/CircleFeaturesProvider";
import { CalendarPanel } from "../../src/features/CalendarPanel";
import { HighlightsPanel } from "../../src/features/HighlightsPanel";
import { ThemeEditor } from "../../src/features/ThemeEditor";
import { CircleRoom } from "../../src/features/room/CircleRoom";
import {
  useCircleTheme,
  useCircleWallpaper,
  themeTint,
} from "../../src/features/theme-context";
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
  memories: "Feed",
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
  const hasWallpaper = !!useCircleWallpaper().uri;
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [coverFocused, setCoverFocused] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const circle = state.circles.find((x) => x.id === id);
  const membership = state.members.find(
    (x) => x.circleId === id && x.userId === user?.id,
  );
  const members = state.members.filter((x) => x.circleId === id);
  const isManager = membership && ["owner", "admin"].includes(membership.role);
  useEffect(() => {
    if (!isManager) setCoverEditorOpen(false);
  }, [isManager]);
  useEffect(() => {
    if (!membership) {
      setOptionsOpen(false);
      setFiltersOpen(false);
    }
  }, [membership]);
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
  const savedName = circle?.name,
    savedDescription = circle?.description,
    savedDiscoverable = circle?.discoverable,
    savedApproval = circle?.approvalRequired;
  const chatScroll = useRef<ScrollView>(null);
  const chatNearBottom = useRef(true);
  useEffect(() => {
    // Saving a cover refreshes the Circle row without erasing other settings drafts.
    if (savedName !== undefined) {
      setEditName(savedName);
      setEditDescription(savedDescription || "");
      setDiscoverable(savedDiscoverable || false);
      setApproval(savedApproval ?? true);
    }
  }, [savedName, savedDescription, savedDiscoverable, savedApproval]);
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
  function invitePeople() {
    setInviteOpen(true);
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
  function showTab(next: Tab) {
    setSurface(null);
    if (next === "Chat") chatNearBottom.current = true;
    setTab(next);
  }
  const options: CircleOption[] = [
    {
      label: "Invite people",
      detail: "Share Circle or invite someone to this Circle",
      icon: UserPlus,
      onPress: invitePeople,
    },
    {
      label: "Calendar",
      detail: "Plans and dates for your Circle",
      icon: CalendarDays,
      onPress: () => setSurface("calendar"),
    },
    {
      label: "Members",
      detail:
        isManager && pending.length
          ? `${pending.length} ${pending.length === 1 ? "request" : "requests"} pending approval`
          : "The people in your Circle",
      icon: Users,
      onPress: () => showTab("Members"),
    },
    {
      label: "About this Circle",
      detail: "Its story, details, and membership",
      icon: Info,
      onPress: () => showTab("About"),
    },
    ...(isModerator
      ? [
          {
            label: "Reports",
            detail: "Review reported posts and messages",
            icon: Shield,
            onPress: () => showTab("Reports"),
          },
        ]
      : []),
    ...(isManager
      ? [
          {
            label: "Circle settings",
            detail: "Circle photo, wallpaper, and Circle details",
            icon: Settings,
            onPress: () => showTab("Settings"),
          },
        ]
      : []),
  ];
  const secondarySection =
    surface === "calendar"
      ? "Circle calendar"
      : surface === "room"
        ? "Room"
        : !["Feed", "Chat", "Highlights"].includes(tab)
          ? tab === "About"
            ? "About this Circle"
            : tab === "Settings"
              ? "Circle settings"
              : tab
          : "";
  const headerActions = membership ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <IconButton
        icon={Video}
        label="Join room"
        onPress={() => setSurface("room")}
        color={palette.teal}
        size={20}
        style={{
          width: 44,
          height: 44,
          backgroundColor: palette.mint,
          borderRadius: 14,
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More Circle options"
        accessibilityHint={
          isManager && pending.length
            ? `${pending.length} requests pending approval. Invitations, calendar, members, and Circle settings`
            : "Invitations, calendar, members, and Circle settings"
        }
        accessibilityState={{ expanded: optionsOpen }}
        onPress={() => setOptionsOpen(true)}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? palette.mint : "transparent",
        })}
      >
        <MoreHorizontal size={22} color={palette.ink} />
        {isManager && pending.length > 0 && (
          <View
            style={{
              position: "absolute",
              right: 8,
              top: 8,
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: palette.teal,
            }}
          />
        )}
      </Pressable>
    </View>
  ) : null;
  return (
    <View style={{ gap: 12 }}>
      <CircleCoverEditor
        visible={coverEditorOpen}
        onClose={() => setCoverEditorOpen(false)}
        circleId={id}
        targetAspectRatio={1}
        onSaved={() => setNotice("Your Circle photo has been updated.")}
      />
      <InviteSheet
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        circleId={id}
      />
      <CircleOptionsSheet
        visible={optionsOpen && !!membership}
        onClose={() => setOptionsOpen(false)}
        options={options}
      />
      <MemoryFiltersSheet
        visible={filtersOpen && !!membership}
        onClose={() => setFiltersOpen(false)}
        months={memoryMonths.map((value) => ({
          value,
          label: monthLabel(value),
        }))}
        month={memoryMonth}
        oldestFirst={oldestFirst}
        onMonthChange={setMemoryMonth}
        onOrderChange={setOldestFirst}
        onReset={() => {
          setMemoryMonth("all");
          setOldestFirst(false);
        }}
      />
      <View testID="circle-header" style={s.header}>
        <Card>
          <View style={s.identityRow}>
            <Pressable
              testID={isManager ? "circle-cover-change" : undefined}
              accessibilityRole={isManager ? "button" : "image"}
              accessibilityLabel={
                isManager
                  ? circle.cover
                    ? "Change Circle photo"
                    : "Add Circle photo"
                  : `${circle.name} photo`
              }
              accessibilityHint={
                isManager
                  ? "Choose a photo, then move and zoom it before saving"
                  : undefined
              }
              disabled={!isManager}
              onFocus={() => setCoverFocused(true)}
              onBlur={() => setCoverFocused(false)}
              onPress={() => setCoverEditorOpen(true)}
              style={({ pressed }) => [
                s.circlePhoto,
                {
                  backgroundColor: circle.color,
                  borderColor: coverFocused ? palette.teal : "transparent",
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              {circle.cover ? (
                <StableImage
                  testID="circle-cover-image"
                  uri={circle.cover}
                  circleId={id}
                  style={{ width: "100%", height: "100%", borderRadius: 22 }}
                  resizeMode="cover"
                />
              ) : (
                <CircleAvatar
                  avatar={circle.avatar}
                  color={circle.color}
                  size={40}
                />
              )}
              {isManager && (
                <View
                  style={[s.photoEditBadge, { backgroundColor: palette.white }]}
                >
                  <Camera size={10} color={palette.ink} />
                </View>
              )}
            </Pressable>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <T
                numberOfLines={1}
                accessibilityRole="header"
                style={{
                  fontFamily: font.editorial,
                  fontSize: width < 650 ? 20 : 25,
                  letterSpacing: -0.4,
                }}
              >
                {circle.name}
              </T>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Lock size={10} color={palette.muted} />
                <T
                  numberOfLines={1}
                  style={{ fontSize: 10, color: palette.muted }}
                >
                  Private
                  {membership
                    ? ` · ${members.length} ${members.length === 1 ? "member" : "members"}`
                    : " Circle"}
                </T>
              </View>
            </View>
            {headerActions}
            {!!membership && width >= 1050 && (
              <Button
                icon={Plus}
                style={{
                  minHeight: 44,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                }}
                onPress={() =>
                  router.push({ pathname: "/create", params: { circleId: id } })
                }
              >
                Add memory
              </Button>
            )}
          </View>
          {!membership && (
            <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
              <Button
                icon={ownRequest ? Check : UserPlus}
                disabled={!!ownRequest || !circle.discoverable}
                onPress={joinCircle}
              >
                {ownRequest
                  ? "Pending approval"
                  : circle.discoverable
                    ? circle.approvalRequired
                      ? "Request to join"
                      : "Join Circle"
                    : "Invitation only"}
              </Button>
            </View>
          )}
          {membership && (
            <View
              style={{
                flexDirection: "row",
                borderTopWidth: 1,
                borderColor: palette.line,
                padding: 5,
                gap: 4,
              }}
            >
              {(["Feed", "Chat", "Highlights"] as Tab[]).map((label) => {
                const selected = !surface && tab === label;
                const Icon =
                  label === "Feed"
                    ? BookOpen
                    : label === "Chat"
                      ? MessageCircle
                      : Sparkles;
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    aria-selected={selected}
                    onPress={() => showTab(label)}
                    style={{
                      flex: 1,
                      minHeight: 48,
                      flexDirection: "row",
                      gap: 6,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 13,
                      backgroundColor: selected ? palette.mint : "transparent",
                    }}
                  >
                    {Icon && (
                      <Icon
                        size={15}
                        color={selected ? palette.teal : palette.muted}
                      />
                    )}
                    <T
                      style={{
                        fontFamily: font.bold,
                        fontSize: 12,
                        color: selected ? palette.teal : palette.muted,
                      }}
                    >
                      {label === "Feed" ? "Memories" : label}
                    </T>
                  </Pressable>
                );
              })}
              {!surface && tab === "Feed" && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Filter memories"
                  accessibilityHint={
                    memoryMonth !== "all" || oldestFirst
                      ? "Date or sort filters are active"
                      : "Choose a month or change moment order"
                  }
                  accessibilityState={{ expanded: filtersOpen }}
                  onPress={() => setFiltersOpen(true)}
                  style={({ pressed }) => ({
                    width: 44,
                    minHeight: 48,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: pressed ? palette.mint : "transparent",
                  })}
                >
                  <SlidersHorizontal size={18} color={palette.teal} />
                  {(memoryMonth !== "all" || oldestFirst) && (
                    <View
                      style={[s.filterDot, { backgroundColor: palette.teal }]}
                    />
                  )}
                </Pressable>
              )}
            </View>
          )}
          {!!membership && !!secondarySection && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingLeft: 18,
                paddingRight: 8,
                borderTopWidth: 1,
                borderColor: palette.line,
              }}
            >
              <T
                accessibilityRole="header"
                style={{ fontFamily: font.bold, fontSize: 12 }}
              >
                {secondarySection}
              </T>
              {surface ? (
                <Button
                  secondary
                  icon={ArrowLeft}
                  style={{ paddingHorizontal: 10 }}
                  onPress={() => setSurface(null)}
                >
                  Back to Circle
                </Button>
              ) : (
                <IconButton
                  icon={X}
                  label={`Close ${secondarySection}`}
                  onPress={() => showTab("Feed")}
                  size={17}
                  style={{ width: 44, height: 44 }}
                />
              )}
            </View>
          )}
        </Card>
      </View>
      {notice ? <Banner text={notice} onDismiss={() => setNotice("")} /> : null}
      {!membership ? (
        <Empty
          title={
            ownRequest ? "Pending approval" : "The good stuff stays inside."
          }
          body={
            ownRequest
              ? "Your request is waiting for an owner or admin. Memories and chat stay private until your membership is approved."
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
              {(memoryMonth !== "all" || oldestFirst) && (
                <View
                  style={[s.activeFilters, { backgroundColor: palette.white }]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit memory filters"
                    onPress={() => setFiltersOpen(true)}
                    style={{ flex: 1, padding: 10 }}
                  >
                    <T style={{ color: palette.muted, fontSize: 11 }}>
                      {memoryMonth === "all"
                        ? "All moments"
                        : monthLabel(memoryMonth)}{" "}
                      · {oldestFirst ? "Oldest first" : "Newest first"}
                    </T>
                  </Pressable>
                  <IconButton
                    icon={X}
                    label="Clear memory filters"
                    onPress={() => {
                      setMemoryMonth("all");
                      setOldestFirst(false);
                    }}
                    style={{ width: 44, height: 44 }}
                  />
                </View>
              )}
              {journal.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
              {!!posts.length && !journal.length && (
                <Empty
                  title="No memories in this month"
                  body="Try another month or clear the filters to see all moments."
                >
                  <Button
                    secondary
                    onPress={() => {
                      setMemoryMonth("all");
                      setOldestFirst(false);
                    }}
                  >
                    Clear filters
                  </Button>
                </Empty>
              )}
              {!!posts.length && (
                <View
                  style={[
                    s.journalFootnote,
                    hasWallpaper && {
                      backgroundColor: palette.white,
                      borderRadius: 12,
                      paddingVertical: 12,
                    },
                  ]}
                >
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
                  body="A favorite photo, a story from today, a simple hello. Use Add memory to start your Circle’s story."
                />
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
                  action="Invite someone"
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
                  More → Members before leaving.
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
              <View testID="circle-cover-settings">
                <Card
                  style={{
                    padding: width < 650 ? 20 : 28,
                    maxWidth: 750,
                    width: "100%",
                    alignSelf: "center",
                    gap: 14,
                  }}
                >
                  <SectionTitle title="Circle photo" />
                  <T
                    style={{
                      color: palette.muted,
                      fontSize: 12,
                      lineHeight: 20,
                    }}
                  >
                    Your Circle’s small picture appears beside its name. Tap it
                    there or choose a new photo here.
                  </T>
                  {!!circle.cover && (
                    <StableImage
                      uri={circle.cover}
                      circleId={id}
                      style={{ height: 64, width: 64, borderRadius: 32 }}
                      resizeMode="cover"
                      accessibilityLabel="Current Circle photo"
                    />
                  )}
                  <View style={{ alignItems: "flex-start" }}>
                    <Button
                      icon={Camera}
                      onPress={() => setCoverEditorOpen(true)}
                    >
                      {circle.cover
                        ? "Change Circle photo"
                        : "Add Circle photo"}
                    </Button>
                  </View>
                </Card>
              </View>
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
                  Invite people
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
  header: { maxWidth: 760, width: "100%", alignSelf: "center" },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
  },
  circlePhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  photoEditBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  filterDot: {
    position: "absolute",
    top: 10,
    right: 9,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  journal: { maxWidth: 760, width: "100%", alignSelf: "center", gap: 14 },
  activeFilters: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    overflow: "hidden",
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
