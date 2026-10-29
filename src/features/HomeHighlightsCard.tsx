import React from "react";
import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { Clapperboard, ArrowUpRight, CheckCheck } from "lucide-react-native";
import { useCircle } from "../state/CircleProvider";
import { useCircleFeatures } from "./CircleFeaturesProvider";
import { buildCatchUp } from "./catchup";
import { T, Card, CircleAvatar } from "../ui/primitives";
import { font, colors as c } from "../ui/theme";
export function HomeHighlightsCard() {
  const { state, joinedCircles } = useCircle();
  const features = useCircleFeatures();
  const summaries = joinedCircles.map((circle) => ({
    circle,
    recap: buildCatchUp(state, features, circle.id),
  }));
  const total = summaries.reduce((sum, x) => sum + x.recap.total, 0);
  return (
    <Card
      style={{
        padding: 22,
        backgroundColor: "#F0F4E9",
        borderColor: "#E7EDDC",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            width: 37,
            height: 37,
            backgroundColor: "#E0E8CF",
            borderRadius: 13,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Clapperboard size={18} color="#78925F" />
        </View>
        <T
          style={{
            fontSize: 9,
            color: "#92A481",
            fontFamily: font.bold,
            letterSpacing: 1.3,
          }}
        >
          HIGHLIGHTS
        </T>
      </View>
      <T
        style={{
          fontFamily: font.heading,
          fontSize: 22,
          lineHeight: 30,
          letterSpacing: -0.6,
          marginTop: 18,
        }}
      >
        {total
          ? "Your Highlights.\nA little closer."
          : "Your Highlights.\nWorth another look."}
      </T>
      <T
        style={{
          fontSize: 11,
          lineHeight: 19,
          color: "#8A967B",
          marginTop: 10,
          marginBottom: 20,
        }}
      >
        {features.ready
          ? `${total} ${total === 1 ? "update" : "updates"} across your little worlds. See what your people have been sharing.`
          : "A few moments to bring you closer to your people."}
      </T>
      <View style={{ gap: 14 }}>
        {summaries.slice(0, 3).map(({ circle, recap }) => (
          <Pressable
            key={circle.id}
            accessibilityRole="link"
            accessibilityLabel={`View Highlights from ${circle.name}`}
            onPress={() => router.push(`/circle/${circle.id}?tab=highlights`)}
            style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            <CircleAvatar
              avatar={circle.avatar}
              color={circle.color}
              size={28}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <T
                style={{ fontFamily: font.bold, fontSize: 11 }}
                numberOfLines={1}
              >
                {circle.name.replace(" Circle", "")}
              </T>
              <T style={{ fontSize: 9, color: "#96A188" }}>
                {recap.total
                  ? `${recap.total} new ${recap.total === 1 ? "update" : "updates"}`
                  : "Up to date"}
              </T>
            </View>
            {recap.total ? (
              <ArrowUpRight size={14} color={c.teal} />
            ) : (
              <CheckCheck size={14} color="#90A17D" />
            )}
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
