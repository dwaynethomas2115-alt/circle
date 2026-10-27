import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ArrowLeft, KeyRound, ArrowRight, Lock } from "lucide-react-native";
import { useCircle } from "../src/state/CircleProvider";
import {
  T,
  Card,
  Field,
  Button,
  Banner,
  IconButton,
} from "../src/ui/primitives";
import { colors as c, font } from "../src/ui/theme";
export default function JoinCircle() {
  const { actions } = useCircle();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function join() {
    setBusy(true);
    try {
      const result = await actions.redeemInvitation(code.trim());
      if (result.ok && result.id) router.replace(`/circle/${result.id}`);
      else
        setError(
          result.error ||
            "This invitation could not be used. Check the code and try again.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View
      style={{ maxWidth: 530, width: "100%", alignSelf: "center", gap: 24 }}
    >
      <IconButton
        icon={ArrowLeft}
        label="Back to Circles"
        onPress={() => router.push("/circles")}
      />
      <Card style={{ padding: 32, gap: 22 }}>
        <View
          style={{
            height: 64,
            width: 64,
            borderRadius: 23,
            backgroundColor: c.mint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <KeyRound size={29} color={c.teal} />
        </View>
        <View style={{ gap: 10 }}>
          <T
            style={{
              fontFamily: font.extra,
              fontSize: 29,
              letterSpacing: -0.8,
            }}
          >
            You’re invited.
          </T>
          <T style={{ color: c.muted, lineHeight: 23 }}>
            Good people. A little shared space. Enter your invitation code to
            join their Circle.
          </T>
        </View>
        {error ? <Banner text={error} onDismiss={() => setError("")} /> : null}
        <Field
          label="Invitation code"
          accessibilityLabel="Invitation code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Enter your code"
          onSubmitEditing={join}
        />
        <Button
          disabled={!code.trim() || busy}
          icon={ArrowRight}
          onPress={join}
        >
          {busy ? "Checking your invitation…" : "Join the Circle"}
        </Button>
        <View style={{ flexDirection: "row", gap: 9, alignItems: "center" }}>
          <Lock size={13} color={c.muted} />
          <T style={{ color: c.muted, fontSize: 11, flex: 1, lineHeight: 18 }}>
            Invitation codes are private and expire. Ask your Circle owner for a
            fresh code if yours no longer works.
          </T>
        </View>
      </Card>
    </View>
  );
}
