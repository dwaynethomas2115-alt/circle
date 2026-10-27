import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import {
  Bell,
  CheckCheck,
  Heart,
  MessageCircle,
  UserPlus,
  Users,
  Sparkles,
  ArrowUpRight,
} from "lucide-react-native";
import { useCircle } from "../src/state/CircleProvider";
import { T, Card, Button, Empty, Banner } from "../src/ui/primitives";
import { colors as c, font } from "../src/ui/theme";
import type { Notification } from "../src/types";
const icons = {
  request: UserPlus,
  approval: Users,
  comment: MessageCircle,
  reaction: Heart,
  invitation: UserPlus,
  post: Sparkles,
};
function relativeTime(value: string) {
  const mins = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 60000),
  );
  return mins < 1
    ? "Just now"
    : mins < 60
      ? `${mins}m ago`
      : mins < 1440
        ? `${Math.floor(mins / 60)}h ago`
        : `${Math.floor(mins / 1440)}d ago`;
}
export default function Notifications() {
  const { notifications, actions, state } = useCircle();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [notice, setNotice] = useState("");
  const unread = notifications.filter((x) => !x.read).length;
  const items = notifications
    .filter((x) => filter === "all" || !x.read)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const open = async (n: Notification) => {
    await actions.markRead(n.id);
    if (n.postId) router.push(`/post/${n.postId}`);
    else if (n.circleId) router.push(`/circle/${n.circleId}`);
  };
  const markAll = async () => {
    const result = await actions.markRead();
    if (!result.ok)
      setNotice(result.error || "Could not update notifications.");
  };
  return (
    <View
      style={{
        maxWidth: 800,
        width: "100%",
        alignSelf: "center",
        gap: 22,
        paddingBottom: 25,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <T
            style={{
              fontFamily: font.heading,
              fontSize: 27,
              letterSpacing: -0.8,
            }}
          >
            A little catch-up
          </T>
          <T style={{ color: c.muted, marginTop: 7 }}>
            The latest from your little world.
          </T>
        </View>
        {unread > 0 && (
          <Button secondary icon={CheckCheck} onPress={markAll}>
            Mark all read
          </Button>
        )}
      </View>
      {!!notice && <Banner text={notice} onDismiss={() => setNotice("")} />}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["all", "unread"] as const).map((tab) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: filter === tab }}
            onPress={() => setFilter(tab)}
            key={tab}
            style={[
              styles.filter,
              filter === tab && { backgroundColor: c.teal },
            ]}
          >
            <T
              style={{
                fontFamily: font.bold,
                fontSize: 12,
                color: filter === tab ? "white" : c.muted,
              }}
            >
              {tab === "all"
                ? "All activity"
                : `Unread${unread ? ` · ${unread}` : ""}`}
            </T>
          </Pressable>
        ))}
      </View>
      {!items.length ? (
        <Empty
          title={
            filter === "unread" ? "All caught up." : "A quiet little moment."
          }
          body={
            filter === "unread"
              ? "You haven’t missed a thing. Go make a new memory with your people."
              : "New reactions, conversations, and Circle updates will find their way here."
          }
        >
          <Button secondary onPress={() => router.push("/")}>
            Back to your feed
          </Button>
        </Empty>
      ) : (
        <Card>
          {items.map((n, i) => {
            const Icon = icons[n.type] || Bell;
            const circle = state.circles.find((x) => x.id === n.circleId);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${n.read ? "" : "Unread: "}${n.title}. ${n.body}`}
                onPress={() => open(n)}
                key={n.id}
                style={({ pressed }) => [
                  {
                    padding: 22,
                    flexDirection: "row",
                    gap: 15,
                    borderTopWidth: i ? 1 : 0,
                    borderColor: c.line,
                    backgroundColor: n.read ? "white" : "#F6FAF6",
                  },
                  pressed && { backgroundColor: "#EFF5EF" },
                ]}
              >
                <View
                  style={[
                    styles.icon,
                    n.type === "reaction" && { backgroundColor: "#F7E8E6" },
                  ]}
                >
                  <Icon
                    color={n.type === "reaction" ? "#C78277" : c.teal}
                    size={19}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <T style={{ fontFamily: font.bold, fontSize: 13, flex: 1 }}>
                      {n.title}
                    </T>
                    {!n.read && (
                      <View
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 4,
                          backgroundColor: c.teal,
                        }}
                      />
                    )}
                  </View>
                  <T
                    style={{
                      fontSize: 12,
                      lineHeight: 20,
                      color: "#7D8B81",
                      marginTop: 5,
                    }}
                  >
                    {n.body}
                  </T>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 7,
                      alignItems: "center",
                      marginTop: 10,
                    }}
                  >
                    {circle && (
                      <>
                        <T
                          style={{
                            fontSize: 10,
                            color: c.teal,
                            fontFamily: font.medium,
                          }}
                        >
                          {circle.name}
                        </T>
                        <T style={{ fontSize: 10, color: c.muted }}>·</T>
                      </>
                    )}
                    <T style={{ fontSize: 10, color: c.muted }}>
                      {relativeTime(n.createdAt)}
                    </T>
                  </View>
                </View>
                <ArrowUpRight
                  color="#A7B4AB"
                  size={15}
                  style={{ marginTop: 2 }}
                />
              </Pressable>
            );
          })}
        </Card>
      )}
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: 7,
          paddingTop: 8,
        }}
      >
        <Bell size={12} color={c.muted} />
        <T style={{ fontSize: 11, color: c.muted }}>
          Only updates from the people in your Circles.
        </T>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  filter: {
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: c.line,
  },
  icon: {
    width: 41,
    height: 41,
    borderRadius: 14,
    backgroundColor: "#E7F0E7",
    alignItems: "center",
    justifyContent: "center",
  },
});
