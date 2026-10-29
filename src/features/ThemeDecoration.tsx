import React from "react";
import { View, StyleSheet } from "react-native";
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
import { useCircleTheme } from "./theme-context";

const motifs: Record<CircleTheme["motif"], LucideIcon[]> = {
  garden: [Leaf, Flower2, Leaf],
  unicorn: [Sparkles, Star, Heart],
  vegas: [Spade, Diamond, Spade],
  coast: [Waves, Shell, Waves],
  minimal: [],
};

/** Small vector details: never behind body copy and never interactive. */
export function ThemeDecoration({
  theme,
  compact = false,
}: {
  theme?: CircleTheme;
  compact?: boolean;
}) {
  const active = useCircleTheme();
  const current = theme || active;
  const Icons = motifs[current.motif];
  const color = current.motif === "vegas" ? "#A78334" : current.accent;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {Icons.map((Icon, index) => (
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
