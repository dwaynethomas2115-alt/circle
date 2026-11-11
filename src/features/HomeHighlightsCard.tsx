import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { ArrowUpRight, CheckCheck, Play } from "lucide-react-native";
import { useCircle } from "../state/CircleProvider";
import { useCircleFeatures } from "./CircleFeaturesProvider";
import { buildCatchUp } from "./catchup";
import { T, Card, CircleAvatar } from "../ui/primitives";
import { font, colors as c } from "../ui/theme";
import { getPostMedia } from "../lib/postMedia";
import { HighlightsPrints } from "./HighlightsPrints";

export function HomeHighlightsCard() {
  const { state, joinedCircles } = useCircle();
  const features = useCircleFeatures();
  const summaries = joinedCircles.map((circle) => ({
    circle,
    recap: buildCatchUp(state, features, circle.id),
  }));
  const total = summaries.reduce((sum, item) => sum + item.recap.total, 0);
  const photos = summaries
    .flatMap(({ circle, recap }) =>
      recap.montage.flatMap((post) =>
        getPostMedia(post).flatMap((media, index) =>
          media.type === "image"
            ? [
                {
                  uri: media.uri,
                  id: `${post.id}:${index}`,
                  circleId: circle.id,
                },
              ]
            : [],
        ),
      ),
    )
    .slice(0, 3);
  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <T style={styles.eyebrow}>HIGHLIGHTS</T>
        <View style={styles.playIcon}>
          <Play size={13} color={c.teal} fill={c.teal} />
        </View>
      </View>
      <HighlightsPrints photos={photos} compact />
      <T accessibilityRole="header" style={styles.title}>
        The good bits, together.
      </T>
      <T style={styles.description}>
        {features.ready
          ? total
            ? `${total} ${total === 1 ? "update" : "updates"} from your people. Pick a Circle to play its reel.`
            : "You’re up to date. Your favourite moments are still here."
          : "A few moments to bring you closer to your people."}
      </T>
      <View style={styles.circles}>
        {summaries.slice(0, 3).map(({ circle, recap }) => (
          <Pressable
            key={circle.id}
            accessibilityRole="link"
            accessibilityLabel={`View Highlights from ${circle.name}`}
            onPress={() => router.push(`/circle/${circle.id}?tab=highlights`)}
            style={({ pressed }) => [
              styles.circle,
              pressed && { opacity: 0.65 },
            ]}
          >
            <View
              style={[
                styles.ring,
                { borderColor: recap.total ? c.teal : c.line },
              ]}
            >
              <CircleAvatar
                avatar={circle.avatar}
                color={circle.color}
                size={29}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <T style={styles.circleName} numberOfLines={1}>
                {circle.name.replace(" Circle", "")}
              </T>
              <T style={styles.circleStatus}>
                {recap.total
                  ? `${recap.total} new ${recap.total === 1 ? "update" : "updates"}`
                  : "Up to date"}
              </T>
            </View>
            {recap.total ? (
              <ArrowUpRight size={16} color={c.teal} />
            ) : (
              <CheckCheck size={16} color={c.teal} />
            )}
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: 21,
    backgroundColor: "#F6F3E9",
    borderColor: c.line,
    borderRadius: 21,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    fontFamily: font.bold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: c.teal,
  },
  playIcon: {
    width: 29,
    height: 29,
    borderRadius: 16,
    backgroundColor: "#E4EADA",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: font.editorial,
    fontSize: 27,
    lineHeight: 33,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  description: { color: c.muted, fontSize: 12, lineHeight: 20, marginTop: 9 },
  circles: { marginTop: 16, gap: 4 },
  circle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 55,
    paddingVertical: 6,
  },
  ring: { padding: 3, borderWidth: 1.5, borderRadius: 25 },
  circleName: { fontFamily: font.bold, fontSize: 12 },
  circleStatus: { fontSize: 11, color: c.muted },
});
