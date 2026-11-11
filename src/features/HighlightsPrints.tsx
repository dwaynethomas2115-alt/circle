import React from "react";
import { View, StyleSheet } from "react-native";
import { Images } from "lucide-react-native";
import { StableImage } from "../ui/StableImage";
import { colors as c } from "../ui/theme";

export type HighlightPhoto = { id: string; uri: string; circleId: string };

/** A small, static fan of real photo prints. Transform wrappers keep image
 * identity stable; there is no offscreen animation or persistent media cache.
 */
export function HighlightsPrints({
  photos,
  compact = false,
}: {
  photos: readonly HighlightPhoto[];
  compact?: boolean;
}) {
  const shown = photos.slice(0, 3);
  const size = compact ? 108 : 154;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: compact ? 224 : 288,
        height: compact ? 152 : 214,
        alignSelf: "center",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {(shown.length ? shown : [null]).map((photo, index, all) => {
        const offset = index - (all.length - 1) / 2;
        return (
          <View
            key={photo?.id || "empty"}
            style={[
              styles.print,
              {
                width: size,
                height: size * 1.16,
                transform: [
                  { translateX: offset * (compact ? 30 : 42) },
                  { translateY: Math.abs(offset) * 6 },
                  { rotate: `${offset * 12 - 2}deg` },
                ],
              },
            ]}
          >
            {photo ? (
              <StableImage
                uri={photo.uri}
                circleId={photo.circleId}
                accessible={false}
                resizeMode="cover"
                style={styles.photo}
              />
            ) : (
              <View style={[styles.photo, styles.empty]}>
                <Images size={34} color={c.teal} strokeWidth={1.2} />
              </View>
            )}
            <View style={styles.captionLine} />
          </View>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  print: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#263B3610",
    padding: 7,
    paddingBottom: 12,
    borderRadius: 3,
    shadowColor: "#183E30",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 12,
    elevation: 2,
  },
  photo: { flex: 1, width: "100%", backgroundColor: "#E5EBE1" },
  empty: { alignItems: "center", justifyContent: "center" },
  captionLine: {
    marginTop: 9,
    width: "34%",
    height: 2,
    backgroundColor: "#263B361A",
    borderRadius: 2,
    alignSelf: "center",
  },
});
