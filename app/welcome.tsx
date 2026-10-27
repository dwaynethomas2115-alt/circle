import React from "react";
import { Asset } from "expo-asset";
import {
  View,
  Image,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { ArrowRight, LockKeyhole, Heart, Users } from "lucide-react-native";
import { useCircle } from "../src/state/CircleProvider";
import { T, Button, Avatar } from "../src/ui/primitives";
import { colors as c, font } from "../src/ui/theme";

export default function Welcome() {
  const { width } = useWindowDimensions();
  const { actions, mode } = useCircle();
  const wide = width >= 820;
  const tryDemo = async () => {
    const result = await actions.signIn("alex@example.com");
    if (result.ok) router.replace("/");
  };
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F7F8F3" }}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View
        style={[styles.page, wide && { flexDirection: "row", padding: 38 }]}
      >
        <View
          style={[styles.copy, wide && { width: "48%", paddingHorizontal: 50 }]}
        >
          <View style={styles.logo}>
            <View style={styles.logoRing} />
            <T
              style={{
                fontFamily: font.extra,
                fontSize: 29,
                letterSpacing: -1.5,
              }}
            >
              circle<T style={{ color: c.teal }}>.</T>
            </T>
          </View>
          <View style={styles.pill}>
            <LockKeyhole size={13} color={c.teal} />
            <T
              style={{
                fontSize: 11,
                fontFamily: font.bold,
                color: c.teal,
                letterSpacing: 1,
              }}
            >
              A LITTLE CLOSER, EVERY DAY
            </T>
          </View>
          <T
            style={[
              styles.headline,
              { fontSize: wide ? 62 : 47, lineHeight: wide ? 72 : 56 },
            ]}
          >
            Your people.{"\n"}
            <T
              style={[
                styles.headline,
                {
                  fontSize: wide ? 62 : 47,
                  lineHeight: wide ? 72 : 56,
                  color: c.teal,
                },
              ]}
            >
              Your place.
            </T>
          </T>
          <T style={styles.subtitle}>
            Life is better with your people. A private space to share the little
            moments, start conversations, and stay close to the ones who matter.
          </T>
          <Button
            icon={ArrowRight}
            onPress={() => router.push("/auth?mode=signup")}
            style={{
              minHeight: 52,
              alignSelf: "flex-start",
              paddingHorizontal: 26,
            }}
          >
            Find your Circle
          </Button>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 20,
            }}
          >
            <T style={{ color: c.muted, fontSize: 13 }}>
              Already feel at home?
            </T>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push("/auth?mode=signin")}
            >
              <T style={{ fontFamily: font.bold, color: c.teal, fontSize: 13 }}>
                Sign in
              </T>
            </Pressable>
          </View>
          {mode === "demo" && (
            <Pressable
              accessibilityRole="button"
              onPress={tryDemo}
              style={{ marginTop: 24 }}
            >
              <T
                style={{
                  fontSize: 12,
                  color: c.teal,
                  textDecorationLine: "underline",
                }}
              >
                Take a look around the interactive demo
              </T>
            </Pressable>
          )}
          <View style={styles.benefits}>
            <View style={styles.benefit}>
              <LockKeyhole size={16} color={c.teal} />
              <T style={styles.small}>Private by design</T>
            </View>
            <View style={styles.benefit}>
              <Users size={16} color={c.teal} />
              <T style={styles.small}>Only your people</T>
            </View>
          </View>
          {mode === "demo" && (
            <T
              style={{
                fontSize: 11,
                color: c.muted,
                lineHeight: 17,
                marginTop: 16,
                maxWidth: 360,
              }}
            >
              Interactive demo · Data stays on this device. Demo accounts are
              not real authentication or private cloud communities.
            </T>
          )}
        </View>
        <View
          style={[
            styles.visual,
            wide
              ? { width: "52%", minHeight: 660 }
              : { minHeight: 440, marginTop: 20 },
          ]}
        >
          <Image
            source={require("../assets/photos/coast.jpg")}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            accessibilityLabel="A quiet sunset by the water"
          />
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: "rgba(17,47,39,.14)" },
            ]}
          />
          <View style={styles.photoCaption}>
            <T
              style={{
                fontSize: 11,
                color: "#FFFFFFCE",
                fontFamily: font.bold,
                letterSpacing: 2,
              }}
            >
              LESS SCROLLING. MORE BELONGING.
            </T>
            <T
              style={{
                fontFamily: font.heading,
                color: "white",
                fontSize: 35,
                lineHeight: 44,
                marginTop: 12,
              }}
            >
              A small world.{"\n"}Full of your favorite people.
            </T>
          </View>
          <View style={styles.floatingCard}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <View style={styles.flower}>
                <T style={{ fontSize: 25 }}>🌼</T>
              </View>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: font.bold, fontSize: 13 }}>
                  Anastasia’s Circle
                </T>
                <T style={{ fontSize: 11, color: c.muted, marginTop: 3 }}>
                  A place for our little moments
                </T>
              </View>
              <Heart size={18} color={c.teal} />
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 16,
              }}
            >
              {["alex", "sarah", "james"].map((name, i) => (
                <View key={name} style={{ marginLeft: i ? -8 : 0 }}>
                  <Avatar
                    uri={
                      Asset.fromModule(
                        name === "alex"
                          ? require("../assets/photos/avatar-alex.jpg")
                          : name === "sarah"
                            ? require("../assets/photos/avatar-sarah.jpg")
                            : require("../assets/photos/avatar-james.jpg"),
                      ).uri
                    }
                    name={name}
                    size={30}
                    border
                  />
                </View>
              ))}
              <T style={{ fontSize: 11, color: c.muted, marginLeft: 10 }}>
                Your people. All here.
              </T>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: {
    flex: 1,
    padding: 23,
    maxWidth: 1600,
    width: "100%",
    alignSelf: "center",
    justifyContent: "center",
  },
  copy: { justifyContent: "center", paddingVertical: 24 },
  logo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 68,
  },
  logoRing: {
    width: 29,
    height: 29,
    borderRadius: 16,
    borderWidth: 7,
    borderColor: c.teal,
  },
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 22,
  },
  headline: { fontFamily: font.extra, letterSpacing: -2.5, color: c.ink },
  subtitle: {
    fontSize: 15,
    lineHeight: 26,
    color: "#7C8B84",
    maxWidth: 390,
    marginTop: 23,
    marginBottom: 28,
  },
  benefits: { flexDirection: "row", gap: 23, marginTop: 46 },
  benefit: { flexDirection: "row", alignItems: "center", gap: 7 },
  small: { fontSize: 11, color: c.muted },
  visual: {
    borderRadius: 26,
    overflow: "hidden",
    justifyContent: "flex-end",
    backgroundColor: "#C4D7C3",
  },
  photoCaption: { padding: 36, paddingBottom: 195 },
  floatingCard: {
    position: "absolute",
    bottom: 35,
    left: 28,
    right: 28,
    maxWidth: 350,
    backgroundColor: "#FFFFFFF2",
    padding: 20,
    borderRadius: 18,
  },
  flower: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: "#F4F0D8",
    justifyContent: "center",
    alignItems: "center",
  },
});
