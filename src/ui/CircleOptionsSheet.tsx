import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ChevronRight, X, type LucideIcon } from "lucide-react-native";
import { useCircleTheme, themeTint } from "../features/theme-context";
import { IconButton, T } from "./primitives";
import { colors, font } from "./theme";

export interface CircleOption {
  label: string;
  detail: string;
  icon: LucideIcon;
  onPress: () => void;
}

export function CircleOptionsSheet({
  visible,
  onClose,
  options,
}: {
  visible: boolean;
  onClose: () => void;
  options: CircleOption[];
}) {
  const theme = useCircleTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.scrim}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close Circle options"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          testID="circle-options-sheet"
          accessibilityViewIsModal
          style={[s.sheet, { backgroundColor: theme.surface }]}
        >
          <View style={s.heading}>
            <T style={{ fontFamily: font.heading, fontSize: 22 }}>
              Circle options
            </T>
            <IconButton
              icon={X}
              label="Close Circle options"
              onPress={onClose}
              style={{ width: 44, height: 44 }}
            />
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {options.map(({ label, detail, icon: Icon, onPress }) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityHint={detail}
                onPress={() => {
                  onClose();
                  onPress();
                }}
                style={({ pressed }) => [
                  s.option,
                  {
                    backgroundColor: pressed
                      ? themeTint(theme.accent)
                      : "transparent",
                  },
                ]}
              >
                <View
                  style={[
                    s.icon,
                    { backgroundColor: themeTint(theme.accent, 0.08) },
                  ]}
                >
                  <Icon size={19} color={theme.accent} strokeWidth={1.7} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <T style={{ fontFamily: font.bold, fontSize: 14 }}>{label}</T>
                  <T
                    style={{
                      color: colors.muted,
                      fontSize: 12,
                      lineHeight: 18,
                    }}
                  >
                    {detail}
                  </T>
                </View>
                <ChevronRight size={17} color={colors.muted} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "#153A3466",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "90%",
    borderRadius: 24,
    padding: 16,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 10,
    marginBottom: 8,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    minHeight: 70,
    borderRadius: 12,
  },
  icon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
});
