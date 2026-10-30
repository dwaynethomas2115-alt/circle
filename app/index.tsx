import React, { useState } from "react";
import {
  View,
  Pressable,
  Image,
  StyleSheet,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Plus,
  Image as ImageIcon,
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
} from "lucide-react-native";
import { useCircle } from "../src/state/CircleProvider";
import { visibleMessages } from "../src/state/model";
import {
  T,
  Avatar,
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

const monthOf = (date: string) =>
  new Date(date).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

export default function Home() {
  const { user, ready, joinedCircles, feed, state } = useCircle();
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"journal" | "photos">("journal");
  const [oldest, setOldest] = useState(false);
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
      <View style={[s.pageHeading, mobile && { marginBottom: 18 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T style={s.greeting}>
            Welcome home, {user?.name.split(" ")[0] || "friend"}.
          </T>
          <T style={[s.title, mobile && { fontSize: 33, lineHeight: 40 }]}>
            A little life, together.
          </T>
          <T style={s.subtitle}>
            Your people. Your moments. A story only you share.
          </T>
        </View>
        {!mobile && (
          <Button icon={Plus} onPress={() => go("/create")}>
            Share a moment
          </Button>
        )}
      </View>
      <View style={s.columns}>
        <View style={s.journal}>
          {!wide && (
            <>
              <View style={s.sectionHeader}>
                <T style={s.sectionLabel}>YOUR CIRCLES</T>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => go("/circles")}
                  style={s.textLink}
                >
                  <T style={s.linkText}>View all</T>
                  <ArrowUpRight size={14} color={c.teal} />
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.worlds}
              >
                {joinedCircles.map((circle) => (
                  <Pressable
                    key={circle.id}
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${circle.name}`}
                    onPress={() => go("/circle/" + circle.id)}
                    style={({ pressed }) => [
                      s.world,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <View
                      style={[
                        s.worldPhoto,
                        mobile && { height: 66 },
                        { backgroundColor: circle.color },
                      ]}
                    >
                      {!!circle.cover && (
                        <Image source={{ uri: circle.cover }} style={s.cover} />
                      )}
                      <View style={s.worldBadge}>
                        <CircleAvatar
                          avatar={circle.avatar}
                          color="transparent"
                          size={24}
                        />
                      </View>
                    </View>
                    <T numberOfLines={1} style={s.worldName}>
                      {circle.name.replace(/ Circle$/, "")}
                    </T>
                  </Pressable>
                ))}
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
                    A new{`\n`}little world
                  </T>
                </Pressable>
              </ScrollView>
            </>
          )}
          <Card
            style={[
              s.composer,
              wide && { marginTop: 0 },
              mobile && { marginTop: 15, padding: 13 },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create a post"
              onPress={() => go("/create")}
              style={s.composerPrompt}
            >
              <Avatar name={user?.name || "You"} uri={user?.avatar} size={40} />
              <View style={{ flex: 1, gap: 4 }}>
                <T style={{ fontFamily: font.medium, fontSize: 14 }}>
                  What do you want to remember?
                </T>
                {!mobile && (
                  <T style={{ fontSize: 12, color: c.muted }}>
                    A photo, a few words, a little piece of today.
                  </T>
                )}
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add photos to a moment"
              onPress={() => go("/create")}
              style={s.photoButton}
            >
              <ImageIcon size={20} color={c.teal} strokeWidth={1.6} />
            </Pressable>
          </Card>
          <View style={[s.feedToolbar, mobile && { marginTop: 17 }]}>
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
                    fontFamily: filter === item.id ? font.bold : font.medium,
                    color: filter === item.id ? c.teal : c.muted,
                  }}
                >
                  {item.name}
                </T>
              </Pressable>
            ))}
          </ScrollView>
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
                {(index === 0 ||
                  monthOf(post.createdAt) !==
                    monthOf(visible[index - 1].createdAt)) && (
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
                        <Image source={{ uri: first.uri }} style={s.cover} />
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
              <Button onPress={() => go("/create")}>Share a moment</Button>
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
            <Card style={{ padding: 17 }}>
              <View style={[s.sectionHeader, { marginBottom: 14 }]}>
                <T style={s.sectionLabel}>YOUR CIRCLES</T>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="View all your Circles"
                  onPress={() => go("/circles")}
                >
                  <ArrowUpRight size={15} color={c.teal} />
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {joinedCircles.slice(0, 4).map((circle) => (
                  <Pressable
                    key={circle.id}
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${circle.name}`}
                    onPress={() => go("/circle/" + circle.id)}
                    style={{ width: "47%", gap: 7 }}
                  >
                    <View
                      style={{
                        height: 62,
                        borderRadius: 6,
                        overflow: "hidden",
                        backgroundColor: circle.color,
                      }}
                    >
                      {!!circle.cover && (
                        <Image source={{ uri: circle.cover }} style={s.cover} />
                      )}
                      <View
                        style={[
                          s.worldBadge,
                          { bottom: 4, left: 4, padding: 2 },
                        ]}
                      >
                        <CircleAvatar
                          avatar={circle.avatar}
                          color="transparent"
                          size={18}
                        />
                      </View>
                    </View>
                    <T
                      numberOfLines={1}
                      style={{ fontSize: 11, fontFamily: font.medium }}
                    >
                      {circle.name.replace(/ Circle$/, "")}
                    </T>
                  </Pressable>
                ))}
              </View>
            </Card>
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
                      style={{ flexDirection: "row", gap: 10 }}
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
  pageHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    marginBottom: 30,
  },
  greeting: {
    fontFamily: font.medium,
    color: c.teal,
    fontSize: 12,
    marginBottom: 9,
  },
  title: {
    fontFamily: font.editorial,
    fontSize: 41,
    lineHeight: 50,
    letterSpacing: -1.2,
    color: c.ink,
  },
  subtitle: { fontSize: 13, lineHeight: 21, color: c.muted, marginTop: 8 },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 34 },
  journal: { flex: 1, minWidth: 0 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 13,
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
    minHeight: 30,
  },
  linkText: { fontSize: 12, color: c.teal, fontFamily: font.medium },
  worlds: { gap: 12, paddingBottom: 6, paddingRight: 4 },
  world: {
    width: 157,
    borderRadius: 12,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: c.line,
    padding: 6,
  },
  worldPhoto: {
    width: "100%",
    height: 89,
    borderRadius: 7,
    overflow: "hidden",
  },
  cover: { width: "100%", height: "100%", resizeMode: "cover" },
  worldBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    borderRadius: 7,
    backgroundColor: "#FFFFFFF2",
    padding: 3,
  },
  worldName: {
    fontFamily: font.bold,
    fontSize: 12,
    paddingHorizontal: 4,
    paddingTop: 10,
    paddingBottom: 5,
  },
  addWorld: {
    width: 97,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDE2D7",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  addCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  composer: {
    marginTop: 22,
    padding: 16,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    borderRadius: 14,
  },
  composerPrompt: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  photoButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: c.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  feedToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 25,
    borderBottomWidth: 1,
    borderColor: c.line,
  },
  viewTabs: { flexDirection: "row", gap: 19 },
  viewTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingBottom: 14,
    paddingTop: 6,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  viewTabActive: { borderBottomColor: c.teal },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingBottom: 8,
  },
  filters: { gap: 6, paddingVertical: 15 },
  filter: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20 },
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
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingTop: 5 },
  photoMemory: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 9,
    padding: 6,
    marginBottom: 6,
  },
  photoMemoryImage: {
    width: "100%",
    aspectRatio: 1,
    overflow: "hidden",
    borderRadius: 4,
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
    fontSize: 11,
    fontFamily: font.medium,
    paddingHorizontal: 2,
    marginTop: 9,
  },
  photoDate: {
    fontSize: 10,
    color: c.muted,
    marginTop: 5,
    marginBottom: 5,
    paddingHorizontal: 2,
  },
  aside: { width: 270, gap: 22 },
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
    paddingTop: 18,
    marginTop: 24,
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
