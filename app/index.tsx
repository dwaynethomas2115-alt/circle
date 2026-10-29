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
  Video,
  Smile,
  ChevronDown,
  ArrowUpRight,
  Sparkles,
  ArrowRight,
  X,
} from "lucide-react-native";
import { useCircle } from "../src/state/CircleProvider";
import {
  T,
  Avatar,
  Card,
  Button,
  SectionTitle,
  Empty,
  Loading,
  CircleAvatar,
} from "../src/ui/primitives";
import { PostCard } from "../src/ui/PostCard";
import { colors as c, font } from "../src/ui/theme";
import { HomeHighlightsCard } from "../src/features/HomeHighlightsCard";
export default function Home() {
  const { user, ready, joinedCircles, feed, state } = useCircle();
  const [filter, setFilter] = useState("all");
  const { q } = useLocalSearchParams<{ q?: string }>();
  const router = useRouter(),
    { width } = useWindowDimensions();
  const wide = width >= 1250;
  const go = (path: string) => router.push(path as never);
  const visible = feed.filter(
    (p) =>
      (filter === "all" || p.circleId === filter) &&
      (!q ||
        (
          p.content +
          " " +
          state.users.find((u) => u.id === p.authorId)?.name +
          " " +
          state.circles.find((c) => c.id === p.circleId)?.name
        )
          .toLowerCase()
          .includes(q.toLowerCase())),
  );
  if (!ready) return <Loading />;
  return (
    <View>
      <View style={[s.pageHeading, { marginBottom: 22 }]}>
        <View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <View
              style={{ width: 18, height: 1, backgroundColor: "#A5B5A5" }}
            />
            <T
              style={{
                color: "#859682",
                fontSize: 9,
                letterSpacing: 1.5,
                fontFamily: font.bold,
              }}
            >
              THE GOOD THINGS, ALL TOGETHER
            </T>
          </View>
          <T
            style={{
              fontFamily: font.extra,
              fontSize: width < 600 ? 29 : 34,
              letterSpacing: -1.2,
            }}
          >
            Welcome home, {user?.name.split(" ")[0] || "friend"}
            <T style={{ fontSize: 29 }}>.</T> <T style={{ fontSize: 23 }}>☀️</T>
          </T>
          <T style={{ color: "#8A988D", fontSize: 12, marginTop: 9 }}>
            The latest moments from the people who matter most.
          </T>
        </View>
        {width > 650 && (
          <Button icon={Plus} onPress={() => go("/create")}>
            Share a moment
          </Button>
        )}
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 26 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ marginBottom: 24 }}>
            <SectionTitle
              title="Your little worlds"
              action="All Circles"
              onPress={() => go("/circles")}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
            >
              {joinedCircles.slice(0, 4).map((circle, i) => (
                <Pressable
                  key={circle.id}
                  onPress={() => go("/circle/" + circle.id)}
                  style={({ pressed }) => [
                    s.world,
                    { width: wide ? 126 : width < 600 ? 120 : 145 },
                    pressed && { transform: [{ translateY: -2 }] },
                  ]}
                >
                  <Image source={{ uri: circle.cover }} style={s.worldImage} />
                  <View style={s.worldShade} />
                  <View style={s.worldBadge}>
                    <CircleAvatar
                      avatar={circle.avatar}
                      color="transparent"
                      size={28}
                    />
                  </View>
                  <View
                    style={{
                      position: "absolute",
                      bottom: 13,
                      left: 12,
                      right: 8,
                    }}
                  >
                    <T
                      numberOfLines={2}
                      style={{
                        fontFamily: font.bold,
                        fontSize: 11,
                        color: "white",
                        lineHeight: 16,
                      }}
                    >
                      {circle.name
                        .replace(" Circle", "")
                        .replace(" Circle", "")}
                    </T>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        marginTop: 5,
                      }}
                    >
                      <View
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 3,
                          backgroundColor: "#CAE4BA",
                        }}
                      />
                      <T style={{ fontSize: 8, color: "#F0F5EC" }}>
                        {
                          state.posts.filter((p) => p.circleId === circle.id)
                            .length
                        }{" "}
                        {state.posts.filter((p) => p.circleId === circle.id)
                          .length === 1
                          ? "moment"
                          : "moments"}
                      </T>
                    </View>
                  </View>
                </Pressable>
              ))}
              <Pressable
                onPress={() => go("/new-circle")}
                style={[s.addWorld, { width: wide ? 84 : 90 }]}
              >
                <View style={s.plusWorld}>
                  <Plus size={20} color="#85A18D" strokeWidth={1.5} />
                </View>
                <T
                  style={{
                    fontSize: 10,
                    color: "#869B89",
                    marginTop: 11,
                    textAlign: "center",
                    lineHeight: 15,
                  }}
                >
                  {"Make a\nnew Circle"}
                </T>
              </Pressable>
            </ScrollView>
          </View>
          <Card style={{ padding: 18, marginBottom: 20 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create a post"
              onPress={() => go("/create")}
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <Avatar name={user?.name || "You"} uri={user?.avatar} size={38} />
              <T style={{ color: "#A0AAA1", fontSize: 12, flex: 1 }}>
                What’s a little moment worth sharing?
              </T>
              <View
                style={{
                  width: 28,
                  height: 28,
                  backgroundColor: "#F0F5ED",
                  borderRadius: 9,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles size={14} color="#9CAD8E" />
              </View>
            </Pressable>
            <View
              style={{
                marginTop: 16,
                paddingTop: 13,
                borderTopWidth: 1,
                borderColor: c.line,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View style={{ flexDirection: "row", gap: 20 }}>
                {[
                  { icon: ImageIcon, label: "Photo", color: "#86A68B" },
                  { icon: Video, label: "Video", color: "#A195B9" },
                  { icon: Smile, label: "Just a thought", color: "#CCA482" },
                ].map(({ icon: Icon, label, color }) => (
                  <Pressable
                    key={label}
                    onPress={() => go("/create")}
                    style={{
                      flexDirection: "row",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <Icon size={15} color={color} strokeWidth={1.6} />
                    <T style={{ fontSize: 10, color: "#8D9A8F" }}>{label}</T>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={() => go("/create")}
                style={{ flexDirection: "row", gap: 5, alignItems: "center" }}
              >
                <T style={{ fontSize: 9, color: "#8D9A8F" }}>Your Circles</T>
                <ChevronDown size={11} color="#8D9A8F" />
              </Pressable>
            </View>
          </Card>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, alignItems: "center" }}
            >
              {[
                { id: "all", name: "All Circles" },
                ...joinedCircles.map((x) => ({
                  id: x.id,
                  name: x.name.replace(" Circle", ""),
                })),
              ].map((x) => (
                <Pressable
                  key={x.id}
                  onPress={() => setFilter(x.id)}
                  style={[
                    s.filter,
                    filter === x.id && { backgroundColor: c.teal },
                  ]}
                >
                  <T
                    style={{
                      fontSize: 10,
                      fontFamily: filter === x.id ? font.bold : font.medium,
                      color: filter === x.id ? "white" : "#90A092",
                    }}
                  >
                    {x.name}
                  </T>
                </Pressable>
              ))}
            </ScrollView>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingLeft: 12,
              }}
            >
              <T style={{ fontSize: 10, color: "#90A092" }}>Recent</T>
              <ChevronDown size={12} color="#90A092" />
            </View>
          </View>
          {!!q && (
            <Pressable
              onPress={() => router.setParams({ q: "" })}
              style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}
            >
              <T>Search results for “{q}”</T>
              <X size={17} color={c.teal} />
            </Pressable>
          )}
          {visible.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {!visible.length && (
            <Empty
              title={q ? "No moments found" : "Make a little moment"}
              body={
                q
                  ? "Try another name, Circle, or word."
                  : "Your Circle starts with a hello. Share something with your people."
              }
            >
              <Button onPress={() => go(q ? "/circles" : "/create")}>
                {q ? "Explore Circles" : "Share a moment"}
              </Button>
            </Empty>
          )}
        </View>
        {wide && (
          <View style={{ width: 276, gap: 23 }}>
            <HomeHighlightsCard />
            <Card style={{ padding: 20 }}>
              <SectionTitle title="Around your Circles" />
              <View style={{ gap: 19 }}>
                {joinedCircles.slice(0, 3).map((circle, i) => (
                  <Pressable
                    key={circle.id}
                    onPress={() => go("/circle/" + circle.id)}
                    style={{
                      flexDirection: "row",
                      gap: 11,
                      alignItems: "flex-start",
                    }}
                  >
                    <CircleAvatar
                      avatar={circle.avatar}
                      color={circle.color}
                      size={32}
                    />
                    <View style={{ flex: 1, gap: 4 }}>
                      <T style={{ fontFamily: font.bold, fontSize: 10 }}>
                        {circle.name}
                      </T>
                      <T
                        style={{
                          fontSize: 10,
                          lineHeight: 16,
                          color: "#91A08E",
                        }}
                      >
                        {i === 0
                          ? "A few new memories to smile about."
                          : i === 1
                            ? "A conversation worth catching up on."
                            : "Your people are making plans."}
                      </T>
                      <T
                        style={{ fontSize: 8, color: "#B1BBAA", marginTop: 2 }}
                      >
                        Stay a little closer
                      </T>
                    </View>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={() => go("/notifications")}
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 5,
                  alignItems: "center",
                  borderTopWidth: 1,
                  borderColor: c.line,
                  paddingTop: 16,
                  marginTop: 20,
                }}
              >
                <T
                  style={{ fontFamily: font.bold, fontSize: 10, color: c.teal }}
                >
                  See what’s happening
                </T>
                <ArrowRight size={12} color={c.teal} />
              </Pressable>
            </Card>
            <View style={{ paddingHorizontal: 3 }}>
              <SectionTitle title="Better with your people" />
              <T
                style={{
                  fontSize: 11,
                  lineHeight: 20,
                  color: "#98A18F",
                  marginTop: -5,
                }}
              >
                There’s always room for someone who matters. Bring them into
                your Circle.
              </T>
              <Pressable
                onPress={() => go("/circles")}
                style={{
                  flexDirection: "row",
                  gap: 6,
                  alignItems: "center",
                  marginTop: 13,
                }}
              >
                <T
                  style={{ fontSize: 11, color: c.teal, fontFamily: font.bold }}
                >
                  Invite your people
                </T>
                <ArrowUpRight size={13} color={c.teal} />
              </Pressable>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 30 }}>
                <T style={{ fontSize: 9, color: "#A7B09F" }}>
                  Private by design
                </T>
                <T style={{ fontSize: 9, color: "#BCC3B6" }}>·</T>
                <T style={{ fontSize: 9, color: "#A7B09F" }}>
                  Made for connection
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
  pageHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  world: {
    height: 130,
    borderRadius: 13,
    overflow: "hidden",
    backgroundColor: "#C3CEC1",
  },
  worldImage: { width: "100%", height: "100%" },
  worldShade: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "100%",
    backgroundColor: "rgba(17,41,29,0.27)",
  },
  worldBadge: {
    position: "absolute",
    top: 10,
    left: 11,
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,.87)",
    alignItems: "center",
    justifyContent: "center",
  },
  addWorld: {
    height: 130,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D3DED2",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5EF",
  },
  plusWorld: {
    width: 34,
    height: 34,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D5E1D1",
    alignItems: "center",
    justifyContent: "center",
  },
  filter: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
});
