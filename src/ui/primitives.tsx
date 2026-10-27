import React from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
  type StyleProp,
  type TextInputProps,
} from "react-native";
import { ArrowUpRight, X, type LucideIcon } from "lucide-react-native";
import { colors as c, font, shadow } from "./theme";
export function T({
  children,
  style,
  ...props
}: React.ComponentProps<typeof Text>) {
  return (
    <Text
      {...props}
      style={[{ fontFamily: font.regular, fontSize: 14, color: c.ink }, style]}
    >
      {children}
    </Text>
  );
}
export function IconButton({
  icon: Icon,
  onPress,
  label,
  color = c.ink,
  size = 20,
  style,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  label: string;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        s.icon,
        pressed && { backgroundColor: c.mint },
        pressed && { opacity: 0.6 },
        style,
      ]}
    >
      <Icon size={size} color={color} strokeWidth={1.7} />
    </Pressable>
  );
}
export function Button({
  children,
  onPress,
  icon: Icon,
  secondary,
  disabled,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  icon?: LucideIcon;
  secondary?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && { backgroundColor: c.mint },
        pressed && { opacity: 0.88 },
        pressed && { transform: [{ scale: 0.98 }] },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      {Icon && <Icon size={17} color={secondary ? c.teal : "white"} />}
      <T
        style={{
          fontFamily: font.bold,
          color: secondary ? c.teal : "white",
          fontSize: 13,
        }}
      >
        {children}
      </T>
    </Pressable>
  );
}
export function Avatar({
  uri,
  name,
  size = 40,
  border = false,
}: {
  uri?: string;
  name: string;
  size?: number;
  border?: boolean;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#E8EDE3",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderWidth: border ? 2 : 0,
        borderColor: "#fff",
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          accessibilityLabel={name}
          style={{ width: size, height: size }}
        />
      ) : (
        <T
          style={{
            fontFamily: font.bold,
            fontSize: size * 0.34,
            color: c.teal,
          }}
        >
          {name
            .split(" ")
            .map((x) => x[0])
            .slice(0, 2)
            .join("")}
        </T>
      )}
    </View>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Field({
  label,
  ...props
}: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 8, marginBottom: 16 }}>
      {label && <T style={{ fontFamily: font.bold, fontSize: 12 }}>{label}</T>}
      <TextInput
        accessibilityLabel={props.accessibilityLabel || label}
        placeholderTextColor="#98A39E"
        {...props}
        style={[
          s.field,
          props.multiline && { minHeight: 110, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function SectionTitle({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={s.between}>
      <T style={{ fontFamily: font.heading, fontSize: 17 }}>{title}</T>
      {action && (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
        >
          <T style={{ color: c.teal, fontSize: 12, fontFamily: font.bold }}>
            {action}
          </T>
          <ArrowUpRight size={13} color={c.teal} />
        </Pressable>
      )}
    </View>
  );
}
export function Empty({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <Card style={{ padding: 40, alignItems: "center", gap: 14 }}>
      <View style={s.emptyRing} />
      <T
        style={{ fontFamily: font.heading, fontSize: 20, textAlign: "center" }}
      >
        {title}
      </T>
      <T
        style={{
          color: c.muted,
          textAlign: "center",
          lineHeight: 22,
          maxWidth: 330,
        }}
      >
        {body}
      </T>
      {children}
    </Card>
  );
}
export function Loading() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 300,
        gap: 15,
      }}
    >
      <ActivityIndicator color={c.teal} />
      <T style={{ color: c.muted }}>Finding your people…</T>
    </View>
  );
}
export function Banner({
  text,
  onDismiss,
}: {
  text: string;
  onDismiss?: () => void;
}) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: c.mint,
        padding: 14,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 16,
      }}
    >
      <T style={{ flex: 1, color: c.teal, lineHeight: 20 }}>{text}</T>
      {onDismiss && (
        <IconButton icon={X} label="Dismiss message" onPress={onDismiss} />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    minHeight: 42,
    borderRadius: 11,
    backgroundColor: c.teal,
    paddingHorizontal: 18,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.line,
    overflow: "hidden",
    ...shadow,
  },
  field: {
    borderWidth: 1,
    borderColor: "#DFE6E1",
    backgroundColor: "#FAFBFA",
    borderRadius: 11,
    padding: 14,
    fontFamily: font.regular,
    fontSize: 14,
    color: c.ink,
  },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  emptyRing: {
    width: 45,
    height: 45,
    borderRadius: 23,
    borderWidth: 9,
    borderColor: "#CFE5DA",
  },
});

export function CircleAvatar({
  avatar,
  color,
  size = 30,
}: {
  avatar: string;
  color: string;
  size?: number;
}) {
  const isPhoto = /^(https?:|file:|blob:|data:|content:|\/)/.test(avatar);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {isPhoto ? (
        <Image source={{ uri: avatar }} style={{ width: size, height: size }} />
      ) : (
        <T style={{ fontSize: size * 0.55 }}>{avatar || "◉"}</T>
      )}
    </View>
  );
}
