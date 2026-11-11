import React, { useState } from "react";
import { View, ScrollView, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarDays, LockKeyhole } from "lucide-react-native";
import { useCircle } from "../src/state/CircleProvider";
import { CalendarPanel } from "../src/features/CalendarPanel";
import { T, CircleAvatar, Empty, Button, Loading } from "../src/ui/primitives";
import { colors as c, font } from "../src/ui/theme";

export default function PlansRoute() {
  const { ready, user } = useCircle();
  const { circleId } = useLocalSearchParams<{ circleId?: string }>();
  if (!ready) return <Loading />;
  if (!user) return null;
  // Account changes discard every local selection/draft immediately.
  return <Plans key={user.id} initialCircleId={circleId} />;
}

function Plans({ initialCircleId }: { initialCircleId?: string }) {
  const { joinedCircles, user } = useCircle();
  const router = useRouter();
  const [selected, setSelected] = useState(
    () => initialCircleId || joinedCircles[0]?.id || "",
  );
  // An unavailable selection stays unavailable until the member chooses again.
  // In particular, an open event draft never moves to a different Circle.
  const circle = joinedCircles.find((item) => item.id === selected);
  return (
    <View testID="plans-page" style={s.page}>
      <View style={s.heading}>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <T accessibilityRole="header" style={s.title}>
            Plans
          </T>
          <T style={s.subtitle}>A place for the next good day together.</T>
        </View>
        <CalendarDays size={25} color={c.teal} strokeWidth={1.4} />
      </View>
      {joinedCircles.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.choices}
        >
          {joinedCircles.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Show plans for ${item.name}`}
              accessibilityState={{ selected: item.id === circle?.id }}
              aria-pressed={item.id === circle?.id}
              onPress={() => setSelected(item.id)}
              style={({ pressed }) => [
                s.choice,
                item.id === circle?.id && s.selected,
                pressed && { opacity: 0.75 },
              ]}
            >
              <CircleAvatar avatar={item.avatar} color={item.color} size={27} />
              <T
                style={[
                  s.choiceName,
                  item.id === circle?.id && { color: c.teal },
                ]}
              >
                {item.name}
              </T>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {circle ? (
        <View testID="plans-selected-circle" style={{ gap: 10 }}>
          <View style={s.privacy}>
            <LockKeyhole size={12} color={c.muted} />
            <T style={s.privateText}>
              Only members of {circle.name} can see these plans.
            </T>
          </View>
          <CalendarPanel
            key={`${user?.id}:${circle.id}`}
            circleId={circle.id}
          />
        </View>
      ) : (
        <Empty
          title={
            joinedCircles.length
              ? "Choose a Circle for your plans"
              : "Good plans start with your people"
          }
          body={
            joinedCircles.length
              ? "This calendar is unavailable. Choose one of your Circles above."
              : "Join or create a Circle to plan together. Pending invitations stay private until membership is approved."
          }
        >
          <Button secondary onPress={() => router.push("/circles")}>
            Your Circles
          </Button>
        </Empty>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: { width: "100%", maxWidth: 1100, alignSelf: "center", gap: 18 },
  heading: { flexDirection: "row", alignItems: "center", gap: 14 },
  title: { fontFamily: font.editorial, fontSize: 32, letterSpacing: -0.8 },
  subtitle: { color: c.muted, fontSize: 13, lineHeight: 20 },
  choices: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 4,
  },
  choice: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.line,
  },
  selected: { borderColor: c.teal, backgroundColor: c.mint },
  choiceName: { fontFamily: font.bold, fontSize: 12, maxWidth: 220 },
  privacy: { flexDirection: "row", alignItems: "center", gap: 6 },
  privateText: { fontSize: 11, lineHeight: 18, color: c.muted, flexShrink: 1 },
});
