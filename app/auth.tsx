import React, { useState } from "react";
import { View, Pressable, StyleSheet, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, ArrowRight, Check, LockKeyhole } from "lucide-react-native";
import { useCircle } from "../src/state/CircleProvider";
import { T, Field, Button, Banner, IconButton } from "../src/ui/primitives";
import { colors as c, font } from "../src/ui/theme";

export default function Auth() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [signup, setSignup] = useState(params.mode === "signup");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { actions, mode } = useCircle();
  const submit = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = signup
        ? await actions.signUp(name, username, email, adult, password)
        : await actions.signIn(email, undefined, password);
      if (result.ok && result.code === "confirm_email") {
        setMessage(
          "Check your email to confirm your account, then come back to sign in.",
        );
        setSignup(false);
        setPassword("");
      } else if (result.ok) router.replace("/");
      else setMessage(result.error || "Please try again.");
    } catch {
      setMessage("We could not connect. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        padding: 24,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.box}>
        <IconButton
          icon={ArrowLeft}
          label="Back to welcome"
          onPress={() => router.replace("/welcome")}
          style={{ marginLeft: -8, marginBottom: 25 }}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 38,
          }}
        >
          <View style={styles.ring} />
          <T
            style={{ fontFamily: font.extra, fontSize: 28, letterSpacing: -1 }}
          >
            circle.
          </T>
        </View>
        <T
          style={{ fontFamily: font.heading, fontSize: 31, letterSpacing: -1 }}
        >
          {signup ? "Make yourself at home." : "Welcome back."}
        </T>
        <T
          style={{
            color: c.muted,
            lineHeight: 22,
            marginTop: 11,
            marginBottom: 27,
          }}
        >
          {signup
            ? "Your next favorite place starts with your people."
            : "Your people have been saving a little space for you."}
        </T>
        {mode === "demo" && (
          <Banner
            text={
              signup
                ? "Local demo account · No password or real authentication. Your data stays on this device."
                : "Local demo · Use alex@example.com to explore, or sign in to an account you created on this device."
            }
          />
        )}
        {!!message && (
          <Banner text={message} onDismiss={() => setMessage("")} />
        )}
        {signup && (
          <>
            <Field
              label="Your name"
              value={name}
              onChangeText={setName}
              placeholder="Alex Morgan"
              autoComplete="name"
              maxLength={80}
            />
            <Field
              label="Username"
              value={username}
              onChangeText={setUsername}
              placeholder="alexmorgan"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
            />
          </>
        )}
        <Field
          label="Email address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
        />
        {mode === "supabase" && (
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            autoComplete={signup ? "new-password" : "current-password"}
          />
        )}
        {signup && (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: adult }}
            onPress={() => setAdult(!adult)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginTop: 2,
              marginBottom: 22,
            }}
          >
            <View
              style={[
                styles.checkbox,
                adult && { backgroundColor: c.teal, borderColor: c.teal },
              ]}
            >
              {adult && <Check size={13} color="white" />}
            </View>
            <T style={{ fontSize: 12, color: c.muted }}>
              I’m 18 or older. Circle starts with adult accounts.
            </T>
          </Pressable>
        )}
        <Button
          icon={ArrowRight}
          onPress={submit}
          disabled={
            busy ||
            !email ||
            (signup && (!name || !username || !adult)) ||
            (mode === "supabase" && password.length < (signup ? 8 : 1))
          }
          style={{ minHeight: 49 }}
        >
          {busy
            ? "One moment…"
            : signup
              ? "Create your account"
              : "Sign in to Circle"}
        </Button>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
            marginTop: 24,
          }}
        >
          <T style={{ fontSize: 12, color: c.muted }}>
            {signup ? "Already have an account?" : "New around here?"}
          </T>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSignup(!signup);
              setMessage("");
            }}
          >
            <T style={{ fontSize: 12, fontFamily: font.bold, color: c.teal }}>
              {signup ? "Sign in" : "Create an account"}
            </T>
          </Pressable>
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 7,
            marginTop: 42,
          }}
        >
          <LockKeyhole size={13} color={c.muted} />
          <T style={{ fontSize: 11, color: c.muted }}>
            A little less public. A lot more personal.
          </T>
        </View>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  box: {
    maxWidth: 430,
    width: "100%",
    alignSelf: "center",
    paddingVertical: 25,
  },
  ring: {
    width: 27,
    height: 27,
    borderRadius: 14,
    borderWidth: 7,
    borderColor: c.teal,
  },
  checkbox: {
    width: 19,
    height: 19,
    borderWidth: 1,
    borderColor: "#CFD9D2",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
});
