import React from "react";
import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, LockKeyhole } from "lucide-react-native";
import { useCircle } from "../src/state/CircleProvider";
import { T, Card, Empty, Button, CircleAvatar } from "../src/ui/primitives";
import { timeAgo } from "../src/ui/PostCard";
import { colors as c, font } from "../src/ui/theme";
export default function Inbox() {
  const { state, joinedCircles, mode } = useCircle();
  const router = useRouter();
  return (
    <View style={{ maxWidth: 800, width: "100%", alignSelf: "center" }}>
      <T style={{ fontFamily: font.extra, fontSize: 31, letterSpacing: -1 }}>
        Keep the conversation going.
      </T>
      <T style={{ color: c.muted, marginTop: 9, marginBottom: 27 }}>
        A little closer, one message at a time.
      </T>
      <Card>
        {joinedCircles.map((circle, i) => {
          const messages = state.messages.filter(
            (m) => m.circleId === circle.id,
          );
          const last = messages[messages.length - 1];
          const author = state.users.find((u) => u.id === last?.authorId);
          return (
            <Pressable
              key={circle.id}
              accessibilityRole="link"
              onPress={() =>
                router.push(`/circle/${circle.id}?tab=chat` as never)
              }
              style={({ pressed }) => ({
                padding: 23,
                flexDirection: "row",
                gap: 15,
                alignItems: "center",
                borderTopWidth: i ? 1 : 0,
                borderColor: c.line,
                backgroundColor: pressed ? c.mint : "white",
              })}
            >
              <CircleAvatar
                avatar={circle.avatar}
                color={circle.color}
                size={51}
              />
              <View style={{ flex: 1, gap: 7 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <T style={{ fontFamily: font.bold, fontSize: 14 }}>
                    {circle.name}
                  </T>
                  <T style={{ fontSize: 10, color: c.muted }}>
                    {last ? timeAgo(last.createdAt) : ""}
                  </T>
                </View>
                <T numberOfLines={1} style={{ fontSize: 12, color: c.muted }}>
                  {last
                    ? `${author?.name.split(" ")[0] || "Member"}: ${last.content}`
                    : "Say the first hello."}
                </T>
              </View>
              <ChevronRight size={17} color="#A4B2A8" />
            </Pressable>
          );
        })}
      </Card>
      {!joinedCircles.length && (
        <Empty
          title="Your conversations start here"
          body="Every Circle comes with a place to chat. Find your people to get started."
        >
          <Button onPress={() => router.push("/circles")}>Find a Circle</Button>
        </Empty>
      )}
      <View
        style={{
          flexDirection: "row",
          gap: 7,
          alignItems: "center",
          marginTop: 24,
          justifyContent: "center",
        }}
      >
        <LockKeyhole size={12} color={c.muted} />
        <T style={{ fontSize: 11, color: c.muted }}>
          {mode === "demo"
            ? "Local demo conversations. Messages do not reach other people."
            : "Private conversations for approved Circle members."}
        </T>
      </View>
    </View>
  );
}
