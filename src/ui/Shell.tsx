import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  TextInput,
  Animated,
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import {
  Home,
  Compass,
  Plus,
  MessageCircle,
  UserRound,
  Search,
  Bell,
  ChevronDown,
  LockKeyhole,
  Heart,
  Settings2,
  ChevronRight,
} from "lucide-react-native";
import { useCircle } from "../state/CircleProvider";
import { T, Avatar, IconButton, CircleAvatar } from "./primitives";
import { colors as c, font } from "./theme";
import { useCircleFeatures } from "../features/CircleFeaturesProvider";
import { defaultTheme, validateTheme } from "../features/themes";
import {
  CircleThemeProvider,
  useCircleTheme,
  themeTint,
} from "../features/theme-context";
import { ThemeDecoration } from "../features/ThemeDecoration";
export const navItems = [
  { label: "Home", path: "/", icon: Home },
  { label: "My Circles", path: "/circles", icon: Compass },
  { label: "Create a post", path: "/create", icon: Plus },
  { label: "Inbox", path: "/inbox", icon: MessageCircle },
  { label: "My profile", path: "/profile", icon: UserRound },
] as const;
export function Brand({ small = false }: { small?: boolean }) {
  const theme = useCircleTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View
        style={{
          width: small ? 29 : 34,
          height: small ? 29 : 34,
          borderRadius: 20,
          borderWidth: 8,
          borderColor: theme.accent,
          transform: [{ rotate: "-22deg" }],
        }}
      >
        <View
          style={{
            position: "absolute",
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: "#C4D9A8",
            right: -9,
            top: -7,
            borderWidth: 2,
            borderColor: "white",
          }}
        />
      </View>
      <T
        style={{
          fontFamily: font.extra,
          fontSize: small ? 26 : 31,
          letterSpacing: -1.6,
        }}
      >
        circle<T style={{ color: theme.accent, fontSize: 31 }}>.</T>
      </T>
    </View>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { state, user } = useCircle();
  const { themes } = useCircleFeatures();
  const circleId = path.match(/^\/circle\/([^/]+)/)?.[1];
  const isMember =
    !!circleId &&
    state.members.some(
      (member) => member.circleId === circleId && member.userId === user?.id,
    );
  const selectedTheme = circleId && isMember ? themes[circleId] : undefined;
  const theme = validateTheme(selectedTheme) ? selectedTheme : defaultTheme;
  return (
    <CircleThemeProvider theme={theme}>
      <ThemedShell decorated={isMember}>{children}</ThemedShell>
    </CircleThemeProvider>
  );
}
function ThemedShell({
  children,
  decorated,
}: {
  children: React.ReactNode;
  decorated: boolean;
}) {
  const theme = useCircleTheme();
  const tint = themeTint(theme.accent);
  const path = usePathname(),
    router = useRouter(),
    { width } = useWindowDimensions();
  const wide = width >= 1050;
  const insets = useSafeAreaInsets();
  const { user, joinedCircles, notifications, mode } = useCircle();
  const [search, setSearch] = useState("");
  const bare = ["/welcome", "/auth"].includes(path);
  if (bare) return <>{children}</>;
  const go = (p: string) => router.push(p as never);
  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {wide && (
        <View
          style={[
            s.sidebar,
            {
              backgroundColor: theme.surface,
              borderColor: themeTint(theme.ink, 0.09),
            },
          ]}
        >
          <Pressable
            accessibilityRole="link"
            onPress={() => go("/")}
            style={{ paddingHorizontal: 26, paddingTop: 35, paddingBottom: 38 }}
          >
            <Brand />
          </Pressable>
          <View style={{ gap: 7, paddingHorizontal: 17 }}>
            {navItems.map(({ label, path: p, icon: Icon }) => {
              const active =
                path === p || (p === "/circles" && path.startsWith("/circle/"));
              return (
                <Pressable
                  key={p}
                  accessibilityRole="link"
                  onPress={() => go(p)}
                  style={({ pressed }) => [
                    s.navItem,
                    active && { backgroundColor: tint },
                    pressed && !active && { backgroundColor: "#F5F7F5" },
                  ]}
                >
                  <Icon
                    size={20}
                    color={active ? theme.accent : "#86938E"}
                    strokeWidth={active ? 2 : 1.7}
                  />
                  <T
                    style={{
                      fontFamily: active ? font.bold : font.medium,
                      color: active ? theme.accent : "#71817A",
                      flex: 1,
                      fontSize: 14,
                    }}
                  >
                    {label}
                  </T>
                  {p === "/inbox" && (
                    <View
                      style={[
                        s.count,
                        { backgroundColor: themeTint(theme.accent, 0.14) },
                      ]}
                    >
                      <T
                        style={{
                          color: theme.accent,
                          fontSize: 10,
                          fontFamily: font.bold,
                        }}
                      >
                        {joinedCircles.length}
                      </T>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
          <View style={{ marginTop: 35, paddingHorizontal: 28 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <T style={s.kicker}>YOUR CIRCLES</T>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create a Circle"
                onPress={() => go("/new-circle")}
              >
                <Plus size={15} color={c.muted} />
              </Pressable>
            </View>
            {joinedCircles.slice(0, 4).map((circle) => (
              <Pressable
                key={circle.id}
                accessibilityRole="link"
                onPress={() => go("/circle/" + circle.id)}
                style={s.circleLink}
              >
                <CircleAvatar
                  avatar={circle.avatar}
                  color={circle.color}
                  size={28}
                />
                <T
                  numberOfLines={1}
                  style={{ fontSize: 12, color: "#75827C", flex: 1 }}
                >
                  {circle.name.replace(" Circle", "")}
                </T>
              </Pressable>
            ))}
            <Pressable
              onPress={() => go("/circles")}
              style={{
                flexDirection: "row",
                gap: 7,
                alignItems: "center",
                marginTop: 7,
              }}
            >
              <T style={{ fontSize: 11, color: c.muted }}>View all Circles</T>
              <ChevronRight size={12} color={c.muted} />
            </Pressable>
          </View>
          <View style={{ flex: 1 }} />
          <View style={[s.sideNote, { backgroundColor: tint }]}>
            <View
              style={{
                width: 31,
                height: 31,
                borderRadius: 10,
                backgroundColor: themeTint(theme.accent, 0.14),
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 11,
              }}
            >
              <LockKeyhole size={15} color={theme.accent} />
            </View>
            <T style={{ fontFamily: font.bold, fontSize: 12, marginBottom: 6 }}>
              A little closer, together.
            </T>
            <T style={{ fontSize: 11, lineHeight: 18, color: "#7A8A80" }}>
              {"Your moments. Your people.\nAlways in your Circle."}
            </T>
            <Heart
              size={13}
              color="#A7C3A8"
              style={{ position: "absolute", right: 17, top: 19 }}
            />
          </View>
          <Pressable
            accessibilityRole="link"
            onPress={() => go("/profile")}
            style={s.sideProfile}
          >
            <Avatar name={user?.name || "You"} uri={user?.avatar} size={35} />
            <View style={{ flex: 1, gap: 3 }}>
              <T style={{ fontFamily: font.bold, fontSize: 12 }}>
                {user?.name || "Welcome back"}
              </T>
              <T style={{ fontSize: 10, color: c.muted }}>
                Your personal space
              </T>
            </View>
            <Settings2 size={15} color={c.muted} />
          </Pressable>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={[
            s.topbar,
            {
              backgroundColor: theme.surface,
              borderColor: themeTint(theme.ink, 0.09),
            },
            !wide && { height: 75, paddingHorizontal: 20 },
          ]}
        >
          {wide ? (
            <View>
              <T style={{ fontSize: 12, color: c.muted, marginBottom: 4 }}>
                A space for what matters.
              </T>
              <T style={{ fontFamily: font.heading, fontSize: 17 }}>
                Your people, a little closer <T style={{ fontSize: 16 }}>🌿</T>
              </T>
            </View>
          ) : (
            <Brand small />
          )}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: wide ? 20 : 9,
            }}
          >
            {wide && (
              <View style={[s.search, { backgroundColor: theme.background }]}>
                <Search size={16} color="#94A39B" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search your Circles"
                  placeholderTextColor="#98A39D"
                  style={
                    {
                      fontFamily: font.regular,
                      fontSize: 12,
                      flex: 1,
                      color: theme.ink,
                      outlineWidth: 0,
                    } as never
                  }
                  onSubmitEditing={() =>
                    go("/?q=" + encodeURIComponent(search))
                  }
                />
              </View>
            )}
            <View style={[s.demo, { backgroundColor: tint }]}>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: theme.accent,
                }}
              />
              <T
                style={{
                  fontSize: 9,
                  color: theme.accent,
                  fontFamily: font.bold,
                }}
              >
                {mode === "appwrite" ? "APPWRITE" : "LOCAL DEMO"}
              </T>
            </View>
            <View>
              <IconButton
                icon={Bell}
                label="Notifications"
                onPress={() => go("/notifications")}
              />
              {notifications.some((n) => !n.read) && (
                <View style={s.notifDot} />
              )}
            </View>
            <Pressable
              accessibilityRole="link"
              onPress={() => go("/profile")}
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Avatar name={user?.name || "You"} uri={user?.avatar} size={35} />
              {wide && <ChevronDown size={13} color={c.muted} />}
            </Pressable>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={{
            padding: wide ? 34 : 18,
            paddingBottom: wide ? 40 : 105 + insets.bottom,
            flexGrow: 1,
          }}
          style={{ flex: 1 }}
        >
          {decorated && <ThemeDecoration />}
          <View style={{ width: "100%", maxWidth: 1160, alignSelf: "center" }}>
            <PageMotion path={path}>{children}</PageMotion>
          </View>
          <View style={s.footer}>
            <LockKeyhole size={11} color="#A8B3AA" />
            <T style={{ fontSize: 10, color: "#99A69C" }}>
              {mode === "appwrite"
                ? "Made for meaningful connections."
                : "Interactive local demo · Sample people & data · No cloud privacy or multi-user chat"}
            </T>
          </View>
        </ScrollView>
        {!wide && (
          <View
            style={[
              s.bottomNav,
              {
                backgroundColor: theme.surface,
                borderColor: themeTint(theme.ink, 0.09),
              },
              { height: 78 + insets.bottom, paddingBottom: 12 + insets.bottom },
            ]}
          >
            {navItems.map(({ label, path: p, icon: Icon }) => (
              <Pressable
                key={p}
                accessibilityRole="link"
                onPress={() => go(p)}
                style={{ alignItems: "center", gap: 5, flex: 1 }}
              >
                <View
                  style={
                    p === "/create"
                      ? [s.createNav, { backgroundColor: theme.accent }]
                      : undefined
                  }
                >
                  <Icon
                    size={22}
                    color={
                      p === "/create"
                        ? "white"
                        : path === p
                          ? theme.accent
                          : "#8A9890"
                    }
                  />
                </View>
                {p !== "/create" && (
                  <T
                    style={{
                      fontSize: 9,
                      color: path === p ? theme.accent : "#8A9890",
                      fontFamily: font.medium,
                    }}
                  >
                    {label.replace("My ", "")}
                  </T>
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", backgroundColor: c.bg },
  sidebar: {
    width: 222,
    backgroundColor: "white",
    borderRightWidth: 1,
    borderRightColor: c.line,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  navActive: { backgroundColor: c.mint },
  count: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: "#D4E9DD",
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    fontSize: 9,
    letterSpacing: 1.6,
    fontFamily: font.bold,
    color: "#9AA59D",
  },
  circleLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 16,
  },
  circleEmoji: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  sideNote: {
    marginHorizontal: 20,
    padding: 16,
    backgroundColor: "#F3F7EF",
    borderRadius: 13,
    marginBottom: 22,
  },
  sideProfile: {
    borderTopWidth: 1,
    borderColor: c.line,
    padding: 19,
    flexDirection: "row",
    gap: 11,
    alignItems: "center",
  },
  topbar: {
    height: 96,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderColor: c.line,
    paddingHorizontal: 35,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  search: {
    height: 38,
    width: 230,
    borderRadius: 9,
    backgroundColor: "#F6F8F5",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 9,
  },
  demo: {
    backgroundColor: c.mint,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  notifDot: {
    position: "absolute",
    height: 5,
    width: 5,
    borderRadius: 3,
    backgroundColor: "#DEAA7F",
    right: 9,
    top: 7,
  },
  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 78,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderColor: c.line,
    flexDirection: "row",
    alignItems: "center",
  },
  createNav: {
    width: 46,
    height: 42,
    marginTop: -9,
    borderRadius: 13,
    backgroundColor: c.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 30,
  },
});

function PageMotion({
  path,
  children,
}: {
  path: string;
  children: React.ReactNode;
}) {
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive || reduce) return;
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 230,
        useNativeDriver: Platform.OS !== "web",
      }).start();
    });
    return () => {
      alive = false;
      progress.stopAnimation();
    };
  }, [path, progress]);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [6, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
