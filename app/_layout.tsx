import React from "react";
import { Slot, Redirect, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { CircleProvider, useCircle } from "../src/state/CircleProvider";
import { Loading, Banner } from "../src/ui/primitives";
import { Shell } from "../src/ui/Shell";
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
        <SafeAreaView
          style={{ flex: 1, backgroundColor: "#fff" }}
          edges={["top", "left", "right"]}
        >
          <StatusBar style="dark" />
          <Gate />
        </SafeAreaView>
      </CircleProvider>
    </SafeAreaProvider>
  );
}

function Gate() {
  const { ready, user, error } = useCircle();
  const path = usePathname();
  if (!ready) return <Loading />;
  if (!user && !["/welcome", "/auth"].includes(path))
    return <Redirect href="/welcome" />;
  return (
    <Shell>
      {!!error && <Banner text={error} />}
      <Slot />
    </Shell>
  );
}
