import { StableImage } from "../src/ui/StableImage";
import React, { useState } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Plus,
  ArrowUpRight,
  ArrowDownUp,
  ArrowRight,
  BookOpen,
  Images,
  MessageCircle,
  LockKeyhole,
  X,
  Layers,
  Play,
  SlidersHorizontal,
} from "lucide-react-native";
import { useCircle } from "../src/state/CircleProvider";
import { visibleMessages } from "../src/state/model";
import {
  T,
  Card,
  Button,
  Empty,
  Loading,
  CircleAvatar,
} from "../src/ui/primitives";
import { PostCard } from "../src/ui/PostCard";
import { colors as c, font } from "../src/ui/theme";
import { HomeHighlightsCard } from "../src/features/HomeHighlightsCard";
import { getPostMedia } from "../src/lib/postMedia";
import { useCircleFeatures } from "../src/features/CircleFeaturesProvider";
import { buildCatchUp } from "../src/features/catchup";

const monthOf = (date: string) =>
  new Date(date).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

export default function Home() {
  const { ready, joinedCircles, feed, state } = useCircle();
  const features = useCircleFeatures();
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"journal" | "photos">("journal");
  const [oldest, setOldest] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const { q } = useLocalSearchParams<{ q?: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 1250;
  const mobile = width < 600;
  const go = (path: string) => router.push(path as never);
  const visible = feed
    .filter(
      (post) =>
        (filter === "all" || post.circleId === filter) &&
        (!q ||
          [
            post.content,
            state.users.find((u) => u.id === post.authorId)?.name,
            state.circles.find((circle) => circle.id === post.circleId)?.name,
          ]
            .join(" ")
            .toLowerCase()
            .includes(q.toLowerCase())),
    )
    .sort((a, b) =>
      oldest
        ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
        : Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  const photoPosts = visible.filter((post) => getPostMedia(post).length > 0);
  const conversations = joinedCircles
    .map((circle) => ({
      circle,
      last: visibleMessages(state, circle.id).at(-1),
    }))
    .filter((item) => item.last)
    .sort(
      (a, b) => Date.parse(b.last!.createdAt) - Date.parse(a.last!.createdAt),
    )
    .slice(0, 3);
  if (!ready) return <Loading />;
  return (
    <View style={s.page}>
      <View testID="home-circles" style={s.circleSection}>
        <View style={s.sectionHeader}>
          <T accessibilityRole="header" style={s.homeTitle}>
            Your Circles
          </T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View all your Circles"
              onPress={() => go("/circles")}
              style={s.textLink}
            >
              <T style={s.linkText}>View all</T>
              <ArrowUpRight size={14} color={c.teal} />
            </Pressable>
            <Pressable
              testID="home-feed-options-toggle"
              accessibilityRole="button"
              accessibilityLabel="Feed options"
              accessibilityHint="Choose journal or photo view, filter by Circle, or change moment order"
              accessibilityState={{ expanded: showOptions }}
              onPress={() => setShowOptions(!showOptions)}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                backgroundColor:
                  showOptions || pressed ? c.mint : "transparent",
              })}
            >
              <SlidersHorizontal size={18} color={c.teal} />
            </Pressable>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.worlds}
        >
          {joinedCircles.map((circle) => {
            const updates = features.ready
              ? buildCatchUp(state, features, circle.id).total
              : 0;
            return (
              <Pressable
                key={circle.id}
                accessibilityRole="link"
                accessibilityLabel={`Open ${circle.name}`}
                accessibilityHint={
                  updates > 0
                    ? `${updates} new ${updates === 1 ? "update" : "updates"}. Highlights are inside your Circle.`
                    : "Open memories, chat, Highlights and plans."
                }
                onPress={() => go("/circle/" + circle.id)}
                style={({ pressed }) => [
                  s.world,
                  mobile && s.worldMobile,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <View style={[s.worldRing, updates > 0 && s.worldRingFresh]}>
                  <View
                    style={[
                      s.worldPhoto,
                      mobile && { height: 60 },
                      { backgroundColor: circle.color },
                    ]}
                  >
                    {circle.cover ? (
                      <StableImage
                        uri={circle.cover}
                        circleId={circle.id}
                        style={s.cover}
                        accessible={false}
                      />
                    ) : (
                      <View style={s.worldFallback}>
                        <CircleAvatar
                          avatar={circle.avatar}
                          color="transparent"
                          size={37}
                        />
                      </View>
                    )}
                    {circle.cover ? (
                      <View style={s.worldBadge}>
                        <CircleAvatar
                          avatar={circle.avatar}
                          color="transparent"
                          size={20}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
                <T numberOfLines={1} style={s.worldName}>
                  {circle.name.replace(/ Circle$/, "")}
                </T>
                <View style={s.worldMeta}>
                  {updates > 0 ? <View style={s.freshDot} /> : null}
                  <T style={[s.worldStatus, updates > 0 && { color: c.teal }]}>
                    {updates > 0
                      ? `${updates > 99 ? "99+" : updates} new`
                      : "Your Circle"}
                  </T>
                </View>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create a new Circle"
            onPress={() => go("/new-circle")}
            style={s.addWorld}
          >
            <View style={s.addCircle}>
              <Plus size={20} color={c.teal} strokeWidth={1.5} />
            </View>
            <T
              style={{
                fontSize: 12,
                color: c.muted,
                textAlign: "center",
                lineHeight: 18,
              }}
            >
              New Circle
            </T>
          </Pressable>
        </ScrollView>
      </View>
      <View style={s.columns}>
        <View testID="home-feed" style={s.journal}>
          {showOptions && (
            <View testID="home-feed-options">
              <View style={s.feedToolbar}>
                <View accessibilityRole="tablist" style={s.viewTabs}>
                  {(
                    [
                      { id: "journal", title: "Journal", icon: BookOpen },
                      { id: "photos", title: "Photos", icon: Images },
                    ] as const
                  ).map(({ id, title, icon: Icon }) => (
                    <Pressable
                      key={id}
                      accessibilityRole="tab"
                      accessibilityLabel={`${title} view`}
                      accessibilityState={{ selected: view === id }}
                      aria-selected={view === id}
                      onPress={() => setView(id)}
                      style={[s.viewTab, view === id && s.viewTabActive]}
                    >
                      <Icon
                        size={16}
                        color={view === id ? c.ink : c.muted}
                        strokeWidth={1.7}
                      />
                      <T
                        style={{
                          fontSize: 13,
                          fontFamily: view === id ? font.bold : font.medium,
                          color: view === id ? c.ink : c.muted,
                        }}
                      >
                        {title}
                      </T>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    oldest ? "Sort newest first" : "Sort oldest first"
                  }
                  onPress={() => setOldest(!oldest)}
                  style={s.sortButton}
                >
                  <ArrowDownUp size={14} color={c.muted} />
                  <T style={{ fontSize: 12, color: c.muted }}>
                    {oldest ? "Oldest first" : "Latest first"}
                  </T>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[
                  s.filters,
                  mobile && { paddingVertical: 10 },
                ]}
              >
                {[
                  { id: "all", name: "All Circles" },
                  ...joinedCircles.map((circle) => ({
                    id: circle.id,
                    name: circle.name.replace(/ Circle$/, ""),
                  })),
                ].map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: filter === item.id }}
                    onPress={() => setFilter(item.id)}
                    style={[s.filter, filter === item.id && s.filterActive]}
                  >
                    <T
                      style={{
                        fontSize: 12,
                        fontFamily:
                          filter === item.id ? font.bold : font.medium,
                        color: filter === item.id ? c.teal : c.muted,
                      }}
                    >
                      {item.name}
                    </T>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
          {!!q && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => router.setParams({ q: "" })}
              style={s.searchResult}
            >
              <T style={{ flex: 1 }}>Results for “{q}”</T>
              <X size={16} color={c.teal} />
            </Pressable>
          )}
          {view === "journal" ? (
            visible.map((post, index) => (
              <React.Fragment key={post.id}>
                {index > 0 &&
                  monthOf(post.createdAt) !==
                    monthOf(visible[index - 1].createdAt) && (
                    <View
                      style={[
                        s.chapter,
                        mobile && { marginBottom: 12, marginTop: 5 },
                      ]}
                    >
                      <View style={s.chapterLine} />
                      <T style={s.chapterText}>{monthOf(post.createdAt)}</T>
                      <View style={s.chapterLine} />
                    </View>
                  )}
                <PostCard post={post} />
              </React.Fragment>
            ))
          ) : (
            <View style={s.photoGrid}>
              {photoPosts.map((post) => {
                const media = getPostMedia(post);
                const first = media[0];
                const author = state.users.find(
                  (person) => person.id === post.authorId,
                );
                return (
                  <Pressable
                    key={post.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open memory: ${post.content || "Photo from " + (author?.name || "your Circle")}`}
                    onPress={() => go("/post/" + post.id)}
                    style={[s.photoMemory, { width: mobile ? "48%" : "31.5%" }]}
                  >
                    <View style={s.photoMemoryImage}>
                      {first.type === "image" ? (
                        <StableImage
                          uri={first.uri}
                          circleId={post.circleId}
                          style={s.cover}
                        />
                      ) : (
                        <View style={s.videoTile}>
                          <Play size={30} color={c.teal} />
                        </View>
                      )}
                      {media.length > 1 && (
                        <View style={s.albumCount}>
                          <Layers size={12} color="white" />
                          <T style={{ color: "white", fontSize: 11 }}>
                            {media.length}
                          </T>
                        </View>
                      )}
                    </View>
                    <T numberOfLines={1} style={s.photoCaption}>
                      {post.content || "A moment together"}
                    </T>
                    <T style={s.photoDate}>
                      {new Date(post.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </T>
                  </Pressable>
                );
              })}
            </View>
          )}
          {!(view === "journal" ? visible : photoPosts).length && (
            <Empty
              title={
                q
                  ? "No moments found"
                  : view === "photos"
                    ? "A place for your photographs"
                    : "The story starts with you"
              }
              body={
                q
                  ? "Try another name, Circle, or word."
                  : view === "photos"
                    ? "Photos and videos shared with this Circle will collect here, ready to revisit."
                    : "Keep a photo, start a conversation, or share a small part of your day."
              }
            >
              <Button onPress={() => go("/create")}>Add memory</Button>
            </Empty>
          )}
          {!!visible.length && (
            <View style={s.endNote}>
              <View style={s.endDot} />
              <T style={s.endText}>Little moments. A shared history.</T>
            </View>
          )}
        </View>
        {wide && (
          <View style={s.aside}>
            <View style={s.asideDate}>
              <View style={s.dateLine} />
              <T style={s.sectionLabel}>
                {new Date()
                  .toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })
                  .toUpperCase()}
              </T>
            </View>
            <HomeHighlightsCard />
            <Card style={{ padding: 22 }}>
              <View style={s.asideTitle}>
                <MessageCircle size={17} color={c.teal} strokeWidth={1.5} />
                <T style={{ fontFamily: font.heading, fontSize: 15 }}>
                  The conversation
                </T>
              </View>
              <T style={s.asideCopy}>The little things between the photos.</T>
              <View style={{ gap: 22, marginTop: 24 }}>
                {conversations.map(({ circle, last }) => {
                  const author = state.users.find(
                    (person) => person.id === last!.authorId,
                  );
                  return (
                    <Pressable
                      key={circle.id}
                      accessibilityRole="link"
                      onPress={() => go(`/circle/${circle.id}?tab=chat`)}
                      style={s.conversation}
                    >
                      <CircleAvatar
                        avatar={circle.avatar}
                        color={circle.color}
                        size={35}
                      />
                      <View style={{ flex: 1, gap: 5 }}>
                        <T
                          numberOfLines={1}
                          style={{ fontFamily: font.bold, fontSize: 12 }}
                        >
                          {circle.name}
                        </T>
                        <T
                          numberOfLines={2}
                          style={{
                            fontSize: 12,
                            lineHeight: 18,
                            color: c.muted,
                          }}
                        >
                          {author?.name.split(" ")[0] || "Member"}:{" "}
                          {last!.content}
                        </T>
                      </View>
                    </Pressable>
                  );
                })}
                {!conversations.length && (
                  <T style={s.asideCopy}>
                    Every Circle has a group chat. Drop in and say hello.
                  </T>
                )}
              </View>
              <Pressable
                accessibilityRole="link"
                onPress={() => go("/inbox")}
                style={s.asideFooter}
              >
                <T style={s.linkText}>Open your chats</T>
                <ArrowRight size={14} color={c.teal} />
              </Pressable>
            </Card>
            <View style={s.archiveNote}>
              <BookOpen size={23} color={c.orange} strokeWidth={1.3} />
              <T style={s.archiveTitle}>
                Someday, these will be{`\n`}the good old days.
              </T>
              <T style={s.asideCopy}>Keep the ordinary days, too.</T>
              <View style={s.privateNote}>
                <LockKeyhole size={12} color={c.muted} />
                <T style={{ fontSize: 11, color: c.muted }}>
                  Shared with your Circles
                </T>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  page: { width: "100%" },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 30 },
  circleSection: { gap: 0, marginBottom: 20 },
  homeTitle: {
    fontFamily: font.heading,
    fontSize: 20,
    letterSpacing: -0.6,
    lineHeight: 28,
  },
  journal: { flex: 1, minWidth: 0 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: font.bold,
    letterSpacing: 1.5,
    color: c.muted,
  },
  textLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  linkText: { fontSize: 12, color: c.teal, fontFamily: font.medium },
  worlds: { gap: 14, paddingBottom: 3, paddingRight: 4 },
  world: { width: 116, alignItems: "center", minHeight: 118 },
  worldMobile: { width: 94, minHeight: 110 },
  worldRing: {
    width: "100%",
    padding: 3,
    borderWidth: 1.5,
    borderRadius: 20,
    borderColor: c.line,
    backgroundColor: c.paper,
  },
  worldRingFresh: { borderColor: c.teal },
  worldPhoto: {
    width: "100%",
    height: 68,
    borderRadius: 15,
    overflow: "hidden",
  },
  cover: { width: "100%", height: "100%", resizeMode: "cover" },
  worldFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  worldBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    borderRadius: 9,
    backgroundColor: "#FFFFFFF2",
    padding: 2,
  },
  worldName: {
    fontFamily: font.bold,
    fontSize: 12,
    paddingHorizontal: 1,
    marginTop: 7,
    lineHeight: 17,
    maxWidth: "100%",
  },
  worldMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  worldStatus: { fontSize: 10, lineHeight: 15, color: c.muted },
  freshDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: c.teal },
  addWorld: {
    width: 80,
    alignItems: "center",
    paddingTop: 4,
    gap: 9,
    minHeight: 110,
  },
  addCircle: {
    width: 60,
    height: 60,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#C7D1C5",
    borderStyle: "dashed",
    backgroundColor: "#EDF1E9",
    alignItems: "center",
    justifyContent: "center",
  },
  feedToolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 3,
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 0,
    borderBottomWidth: 1,
    borderColor: c.line,
  },
  viewTabs: { flexDirection: "row", gap: 12, flexShrink: 1 },
  viewTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 44,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  viewTabActive: { borderBottomColor: c.teal },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 5,
  },
  filters: { gap: 6, paddingVertical: 15 },
  filter: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 20,
  },
  filterActive: { backgroundColor: "#E7EDE3" },
  searchResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  chapter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 18,
    marginTop: 9,
  },
  chapterLine: { flex: 1, height: 1, backgroundColor: c.line },
  chapterText: {
    fontSize: 11,
    letterSpacing: 0.5,
    color: c.muted,
    fontFamily: font.medium,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
    paddingTop: 5,
  },
  photoMemory: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 4,
    padding: 7,
    marginBottom: 6,
  },
  photoMemoryImage: {
    width: "100%",
    aspectRatio: 1,
    overflow: "hidden",
    borderRadius: 2,
    backgroundColor: c.mint,
  },
  videoTile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.mint,
  },
  albumCount: {
    position: "absolute",
    right: 7,
    top: 7,
    backgroundColor: "#263B36CC",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
  },
  photoCaption: {
    fontSize: 12,
    fontFamily: font.medium,
    paddingHorizontal: 2,
    marginTop: 9,
    lineHeight: 18,
  },
  photoDate: {
    fontSize: 10,
    color: c.muted,
    marginTop: 5,
    marginBottom: 5,
    paddingHorizontal: 2,
  },
  aside: { width: 270, gap: 22 },
  conversation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
  },
  asideDate: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    height: 30,
  },
  dateLine: { width: 20, height: 1, backgroundColor: c.orange },
  asideTitle: { flexDirection: "row", gap: 9, alignItems: "center" },
  asideCopy: { color: c.muted, fontSize: 12, lineHeight: 20, marginTop: 8 },
  asideFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: c.line,
    paddingVertical: 10,
    marginTop: 20,
    minHeight: 44,
  },
  archiveNote: { padding: 16, gap: 5 },
  archiveTitle: {
    fontFamily: font.editorial,
    fontSize: 22,
    lineHeight: 30,
    marginTop: 9,
  },
  privateNote: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    marginTop: 20,
  },
  endNote: { alignItems: "center", gap: 10, paddingVertical: 25 },
  endDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#C5CDBD" },
  endText: { fontSize: 11, color: c.muted },
});
