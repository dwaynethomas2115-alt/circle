import React, { useState } from "react";
import { Image, View, StyleSheet } from "react-native";
import {
  Leaf,
  Flower2,
  Sparkles,
  Star,
  Heart,
  Spade,
  Diamond,
  Waves,
  Shell,
  type LucideIcon,
} from "lucide-react-native";
import type { CircleTheme } from "./types";
import { useCircleTheme, useCircleWallpaper } from "./theme-context";

const motifs: Record<CircleTheme["motif"], LucideIcon[]> = {
  garden: [Leaf, Flower2, Leaf],
  unicorn: [Sparkles, Star, Heart],
  vegas: [Spade, Diamond, Spade],
  coast: [Waves, Shell, Waves],
  minimal: [],
};

/** Full-strength wallpaper; text and controls use their own readable surfaces. */
export function ThemeDecoration({
  theme,
  compact = false,
  onLoad,
  onError,
}: {
  theme?: CircleTheme;
  compact?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}) {
  const active = useCircleTheme();
  const wallpaper = useCircleWallpaper();
  const [failedUri, setFailedUri] = useState<string>();
  const current = theme || active;
  const uri =
    current.wallpaperPath === active.wallpaperPath ? wallpaper.uri : undefined;
  const hasImage = !!uri && failedUri !== uri;
  const Icons = motifs[current.motif];
  const color = current.motif === "vegas" ? "#A78334" : current.accent;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
    >
      {hasImage && (
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          onLoad={onLoad}
          onError={() => {
            setFailedUri(uri);
            onError?.();
          }}
        />
      )}
      {!hasImage &&
        Icons.map((Icon, index) => (
          <View
            key={index}
            style={{
              position: "absolute",
              right: compact ? 12 + index * 31 : 22 + index * 57,
              top: compact ? 12 + (index % 2) * 15 : 22 + (index % 2) * 33,
              opacity: compact ? 0.09 : 0.055,
              transform: [{ rotate: `${index === 1 ? 12 : -12}deg` }],
            }}
          >
            <Icon color={color} size={compact ? 23 : 43} strokeWidth={1.3} />
          </View>
        ))}
    </View>
  );
}
