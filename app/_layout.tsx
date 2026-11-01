import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Navigator, Slot, Redirect, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { CircleProvider, useCircle } from "../src/state/CircleProvider";
import { Loading, Banner, Button, Card, T } from "../src/ui/primitives";
import { font, colors } from "../src/ui/theme";
import type { Result } from "../src/types";
import { Shell } from "../src/ui/Shell";
import { CircleFeaturesProvider } from "../src/features/CircleFeaturesProvider";
export default function Layout() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <CircleProvider>
        <CircleFeaturesProvider>
          <SafeAreaView
            style={{ flex: 1, backgroundColor: "#fff" }}
            edges={["top", "left", "right"]}
          >
            <StatusBar style="dark" />
            <Navigator>
              <Gate />
            </Navigator>
          </SafeAreaView>
        </CircleFeaturesProvider>
      </CircleProvider>
    </SafeAreaProvider>
  );
}

function Gate() {
  const { ready, user, error, mode, authStatus, retryConnection, actions } =
    useCircle();
  const path = usePathname();
  if (!ready) return <Loading />;
  if (mode === "appwrite" && authStatus === "unknown")
    return (
      <ConnectionRecovery
        onRetry={retryConnection}
        onSignOut={actions.signOut}
      />
    );
  if (!user && !["/welcome", "/auth", "/join"].includes(path))
    return <Redirect href="/welcome" />;
  return (
    <Shell>
      {!!error && <Banner text={error} />}
      <Slot />
    </Shell>
  );
}

function ConnectionRecovery({
  onRetry,
  onSignOut,
}: {
  onRetry?: () => Promise<void>;
  onSignOut?: () => Result | Promise<Result>;
}) {
  const [busy, setBusy] = useState<"retry" | "signout" | null>(null);
  const [notice, setNotice] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 24,
        backgroundColor: colors.bg,
      }}
    >
      <Card
        style={{
          width: "100%",
          maxWidth: 480,
          alignSelf: "center",
          padding: 28,
          gap: 18,
        }}
      >
        <T style={{ fontFamily: font.heading, fontSize: 27 }}>
          Reconnect to Circle
        </T>
        <T style={{ color: colors.muted, lineHeight: 23 }}>
          Circle couldn’t check your connection. A connection problem doesn’t
          always mean you’re signed out. Try reconnecting first.
        </T>
        <Button
          disabled={!!busy || !onRetry}
          onPress={() => {
            if (busy || !onRetry) return;
            setBusy("retry");
            setNotice("");
            void onRetry()
              .catch(() => undefined)
              .finally(() => {
                if (mounted.current) setBusy(null);
              });
          }}
        >
          {busy === "retry" ? "Reconnecting…" : "Try again"}
        </Button>
        {!!notice && <Banner text={notice} />}
        <Button
          secondary
          disabled={!!busy || !onSignOut}
          onPress={() => {
            if (busy || !onSignOut) return;
            setBusy("signout");
            setNotice("");
            void (async () => {
              try {
                const result = await onSignOut();
                if (mounted.current && !result.ok)
                  setNotice(
                    "We couldn’t confirm sign-out. Check your connection and try again.",
                  );
              } catch {
                if (mounted.current)
                  setNotice(
                    "We couldn’t confirm sign-out. Check your connection and try again.",
                  );
              } finally {
                if (mounted.current) setBusy(null);
              }
            })();
          }}
        >
          {busy === "signout" ? "Signing out…" : "Sign out on this device"}
        </Button>
      </Card>
    </View>
  );
}
