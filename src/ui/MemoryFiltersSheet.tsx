import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Check, X } from "lucide-react-native";
import { useCircleTheme, themeTint } from "../features/theme-context";
import { Button, IconButton, T } from "./primitives";
import { colors, font } from "./theme";

/** Browsing controls stay out of the journal until someone needs them. */
export function MemoryFiltersSheet({
  visible,
  onClose,
  months,
  month,
  oldestFirst,
  onMonthChange,
  onOrderChange,
  onReset,
}: {
  visible: boolean;
  onClose: () => void;
  months: { value: string; label: string }[];
  month: string;
  oldestFirst: boolean;
  onMonthChange: (value: string) => void;
  onOrderChange: (value: boolean) => void;
  onReset: () => void;
}) {
  const theme = useCircleTheme();
  function choice(label: string, selected: boolean, onPress: () => void) {
    return (
      <Pressable
        key={label}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        aria-checked={selected}
        onPress={onPress}
        style={({ pressed }) => [
          s.choice,
          {
            backgroundColor:
              selected || pressed ? themeTint(theme.accent) : "transparent",
          },
        ]}
      >
        <T style={{ flex: 1, fontSize: 14 }}>{label}</T>
        {selected && <Check size={18} color={theme.accent} />}
      </Pressable>
    );
  }
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
          accessibilityLabel="Close memory filters"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          testID="memory-filters"
          accessibilityViewIsModal
          style={[s.sheet, { backgroundColor: theme.surface }]}
        >
          <View style={s.heading}>
            <T
              accessibilityRole="header"
              style={{ fontFamily: font.heading, fontSize: 22 }}
            >
              Memory filters
            </T>
            <IconButton
              icon={X}
              label="Close memory filters"
              onPress={onClose}
              style={{ width: 44, height: 44 }}
            />
          </View>
          <ScrollView contentContainerStyle={{ gap: 16 }}>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Moment order"
            >
              <T style={s.label}>Sort by</T>
              {choice("Newest first", !oldestFirst, () => onOrderChange(false))}
              {choice("Oldest first", oldestFirst, () => onOrderChange(true))}
            </View>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Memory month"
            >
              <T style={s.label}>Month</T>
              {choice("All moments", month === "all", () =>
                onMonthChange("all"),
              )}
              {months.map(({ value, label }) =>
                choice(label, month === value, () => onMonthChange(value)),
              )}
            </View>
          </ScrollView>
          <View style={s.footer}>
            <Button secondary onPress={onReset}>
              Reset filters
            </Button>
            <Button onPress={onClose}>Done</Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "#153A3466",
    padding: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "90%",
    padding: 16,
    gap: 12,
    borderRadius: 24,
  },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingLeft: 10,
  },
  label: {
    fontFamily: font.bold,
    color: colors.muted,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  choice: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
});
