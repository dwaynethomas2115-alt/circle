import React, { useState } from "react";
import {
  View,
  Pressable,
  Image,
  useWindowDimensions,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";
import {
  Plus,
  ArrowUpRight,
  Lock,
  Users,
  KeyRound,
  Clock,
} from "lucide-react-native";
import { useCircle } from "../src/state/CircleProvider";
import {
  T,
  Card,
  Button,
  Avatar,
  Field,
  Empty,
  Banner,
} from "../src/ui/primitives";
import { colors as c, font } from "../src/ui/theme";
export default function CirclesScreen() {
  const { state, user, joinedCircles, actions } = useCircle();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<"joined" | "discover" | "pending">("joined");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const ids = new Set(joinedCircles.map((x) => x.id));
  const pending = state.requests.filter(
    (x) => x.userId === user?.id && x.status === "pending",
  );
  const circles = (
    tab === "joined"
      ? joinedCircles
      : tab === "discover"
        ? state.circles.filter((x) => x.discoverable && !ids.has(x.id))
        : state.circles.filter((x) => pending.some((r) => r.circleId === x.id))
  ).filter((x) =>
    `${x.name} ${x.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  async function request(id: string) {
    const circle = state.circles.find((x) => x.id === id);
    const result = await actions.requestJoin(id);
    const joined =
      result.code === "joined" ||
      (!result.code && circle?.approvalRequired === false);
    if (result.ok && joined) setTab("joined");
    setNotice(
      result.ok
        ? joined
          ? `You’re in! Welcome to ${circle?.name || "your new Circle"}.`
          : "Your request is on its way. A Circle admin will review it soon."
        : result.error || "Unable to send request.",
    );
  }
  return (
    <View style={{ gap: 24 }}>
      <View style={s.titleRow}>
        <View style={{ gap: 8, flex: 1 }}>
          <T style={s.eyebrow}>A LITTLE CLOSER, EVERY DAY</T>
          <T style={s.title}>Your people, in one place.</T>
          <T style={{ color: c.muted, lineHeight: 22 }}>
            Different parts of your life. The same feeling of belonging.
          </T>
        </View>
        <Button icon={Plus} onPress={() => router.push("/new-circle")}>
          Create a Circle
        </Button>
      </View>
      {notice ? <Banner text={notice} onDismiss={() => setNotice("")} /> : null}
      <View
        style={{
          flexDirection: width < 650 ? "column" : "row",
          gap: 14,
          justifyContent: "space-between",
        }}
      >
        <View style={s.tabs}>
          {(
            [
              ["joined", "My Circles"],
              ["discover", "Discover"],
              [
                "pending",
                `Pending${pending.length ? ` (${pending.length})` : ""}`,
              ],
            ] as const
          ).map(([key, title]) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === key }}
              aria-selected={tab === key}
              key={key}
              onPress={() => setTab(key)}
              style={[s.tab, tab === key && s.activeTab]}
            >
              <T
                style={{
                  fontFamily: font.bold,
                  color: tab === key ? c.teal : c.muted,
                  fontSize: 13,
                }}
              >
                {title}
              </T>
            </Pressable>
          ))}
        </View>
        <View style={{ minWidth: 200, flex: width < 650 ? undefined : 0.45 }}>
          <Field
            accessibilityLabel="Search Circles"
            placeholder="Search your Circles…"
            value={query}
            onChangeText={setQuery}
            style={{ paddingVertical: 11, backgroundColor: "white" }}
          />
        </View>
      </View>
      {tab === "discover" && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginTop: -10,
          }}
        >
          <Lock size={14} color={c.teal} />
          <T style={{ color: c.muted, fontSize: 12, flex: 1 }}>
            Find your community. Posts, photos, and conversations stay private
            to approved members.
          </T>
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
        {circles.map((circle) => {
          const memberCount = state.members.filter(
            (m) => m.circleId === circle.id,
          ).length;
          const members = state.members
            .filter((m) => m.circleId === circle.id)
            .slice(0, 4)
            .map((m) => state.users.find((u) => u.id === m.userId))
            .filter(Boolean);
          const isPending = pending.some((r) => r.circleId === circle.id);
          return (
            <Card
              key={circle.id}
              style={{
                width:
                  width >= 1200 ? "31.5%" : width >= 700 ? "47.8%" : "100%",
              }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/circle/${circle.id}`)}
              >
                <View style={{ height: 146, backgroundColor: circle.color }}>
                  {circle.cover ? (
                    <Image
                      source={{ uri: circle.cover }}
                      style={{ width: "100%", height: "100%" }}
                    />
                  ) : (
                    <View style={s.coverFallback}>
                      <Users size={55} color="#FFFFFFAA" />
                      <View style={s.decorativeCircle} />
                    </View>
                  )}
                  <View style={s.privatePill}>
                    <Lock size={10} color="white" />
                    <T
                      style={{
                        color: "white",
                        fontSize: 10,
                        fontFamily: font.bold,
                      }}
                    >
                      PRIVATE CIRCLE
                    </T>
                  </View>
                </View>
                <View style={{ padding: 20, gap: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <T
                      style={{
                        color: c.teal,
                        fontSize: 10,
                        fontFamily: font.bold,
                        letterSpacing: 1,
                      }}
                    >
                      {circle.category.toUpperCase()}
                    </T>
                    <ArrowUpRight color={c.muted} size={17} />
                  </View>
                  <T style={{ fontFamily: font.heading, fontSize: 20 }}>
                    {circle.name}
                  </T>
                  <T
                    numberOfLines={2}
                    style={{ color: c.muted, lineHeight: 21, minHeight: 42 }}
                  >
                    {circle.description}
                  </T>
                </View>
              </Pressable>
              <View
                style={{
                  marginHorizontal: 20,
                  paddingVertical: 17,
                  borderTopWidth: 1,
                  borderColor: c.line,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {members.map(
                    (member, i) =>
                      member && (
                        <View
                          key={member.id}
                          style={{ marginLeft: i ? -9 : 0 }}
                        >
                          <Avatar
                            uri={member.avatar}
                            name={member.name}
                            size={26}
                            border
                          />
                        </View>
                      ),
                  )}
                  <T style={{ marginLeft: 8, fontSize: 11, color: c.muted }}>
                    {memberCount} {memberCount === 1 ? "member" : "members"}
                  </T>
                </View>
                {ids.has(circle.id) ? (
                  <Button
                    secondary
                    onPress={() => router.push(`/circle/${circle.id}`)}
                  >
                    Open Circle
                  </Button>
                ) : isPending ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Clock size={13} color={c.orange} />
                    <T style={{ fontSize: 12, color: c.muted }}>Requested</T>
                  </View>
                ) : (
                  <Button secondary onPress={() => request(circle.id)}>
                    {circle.approvalRequired
                      ? "Request to join"
                      : "Join Circle"}
                  </Button>
                )}
              </View>
            </Card>
          );
        })}
      </View>
      {!circles.length && (
        <Empty
          title={
            query
              ? "No Circles found"
              : tab === "pending"
                ? "All caught up"
                : tab === "discover"
                  ? "A little world of your own"
                  : "Your people are waiting"
          }
          body={
            query
              ? "Try another name or category."
              : tab === "pending"
                ? "Your pending membership requests will appear here."
                : tab === "discover"
                  ? "Join with an invitation code, or create a new space for your people."
                  : "Create a Circle or join one with an invitation code."
          }
        >
          <Button onPress={() => router.push("/join")} icon={KeyRound}>
            Join with an invite
          </Button>
        </Empty>
      )}
      <Card
        style={{
          padding: 24,
          backgroundColor: "#EEF5EF",
          borderColor: "#E2EDE3",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 18,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <View
            style={{
              width: 45,
              height: 45,
              borderRadius: 14,
              backgroundColor: "white",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <KeyRound color={c.teal} size={21} />
          </View>
          <View style={{ flex: 1, minWidth: 170, gap: 5 }}>
            <T style={{ fontFamily: font.heading, fontSize: 16 }}>
              An invitation to something good.
            </T>
            <T style={{ color: c.muted, fontSize: 13 }}>
              Have a Circle invitation? Your seat is already saved.
            </T>
          </View>
          <Button secondary onPress={() => router.push("/join")}>
            Enter invitation code
          </Button>
        </View>
      </Card>
    </View>
  );
}
const s = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 20,
  },
  eyebrow: {
    color: c.teal,
    fontSize: 10,
    fontFamily: font.bold,
    letterSpacing: 1.7,
  },
  title: { fontFamily: font.extra, fontSize: 30, letterSpacing: -1 },
  tabs: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: "#EDF1ED",
    padding: 4,
    borderRadius: 12,
  },
  tab: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 9 },
  activeTab: { backgroundColor: "white" },
  privatePill: {
    position: "absolute",
    top: 14,
    left: 14,
    backgroundColor: "#203B3970",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  coverFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  decorativeCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderColor: "#FFFFFF22",
    borderWidth: 30,
    position: "absolute",
    right: -40,
    bottom: -80,
  },
});
