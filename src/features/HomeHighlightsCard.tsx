import React from "react";
import { View, Pressable, Image } from "react-native";
import { router } from "expo-router";
import { Clapperboard, ArrowUpRight, CheckCheck } from "lucide-react-native";
import { useCircle } from "../state/CircleProvider";
import { useCircleFeatures } from "./CircleFeaturesProvider";
import { buildCatchUp } from "./catchup";
import { T, Card, CircleAvatar } from "../ui/primitives";
import { font, colors as c } from "../ui/theme";
import { getPostMedia } from "../lib/postMedia";
export function HomeHighlightsCard() {
  const { state, joinedCircles } = useCircle();
  const features = useCircleFeatures();
  const summaries = joinedCircles.map((circle) => ({
    circle,
    recap: buildCatchUp(state, features, circle.id),
  }));
  const total = summaries.reduce((sum, x) => sum + x.recap.total, 0);
  const photos = summaries
    .flatMap(({ recap }) =>
      recap.montage.flatMap((post) =>
        getPostMedia(post)
          .filter((media) => media.type === "image")
          .map((media) => ({ uri: media.uri, id: post.id })),
      ),
    )
    .slice(0, 3);
  return (
    <Card
      style={{
        padding: 22,
        backgroundColor: "#F9F7F0",
        borderColor: c.line,
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
            backgroundColor: "#E8EDE2",
            borderRadius: 13,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Clapperboard size={18} color={c.teal} />
        </View>
        <T
          style={{
            fontSize: 9,
            color: c.muted,
            fontFamily: font.bold,
            letterSpacing: 1.3,
          }}
        >
          HIGHLIGHTS
        </T>
      </View>
      <T
        style={{
          fontFamily: font.editorial,
          fontSize: 28,
          lineHeight: 34,
          letterSpacing: -0.5,
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
          color: c.muted,
          marginTop: 10,
          marginBottom: 20,
        }}
      >
        {features.ready
          ? `${total} ${total === 1 ? "update" : "updates"} across your Circles. A few pages worth revisiting.`
          : "A few moments to bring you closer to your people."}
      </T>
      {photos.length > 0 && (
        <View style={{ flexDirection: "row", gap: 7, marginBottom: 22 }}>
          {photos.map((photo, index) => (
            <Image
              key={`${photo.id}:${index}`}
              source={{ uri: photo.uri }}
              accessibilityLabel="A recent Circle memory"
              style={{
                flex: 1,
                height: 88,
                borderRadius: 6,
                borderWidth: 3,
                borderColor: "white",
                transform: [{ rotate: index === 1 ? "3deg" : "-2deg" }],
              }}
            />
          ))}
        </View>
      )}
      <View style={{ gap: 16 }}>
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
                style={{ fontFamily: font.bold, fontSize: 12 }}
                numberOfLines={1}
              >
                {circle.name.replace(" Circle", "")}
              </T>
              <T style={{ fontSize: 11, color: c.muted }}>
                {recap.total
                  ? `${recap.total} new ${recap.total === 1 ? "update" : "updates"}`
                  : "Up to date"}
              </T>
            </View>
            {recap.total ? (
              <ArrowUpRight size={14} color={c.teal} />
            ) : (
              <CheckCheck size={14} color={c.teal} />
            )}
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
