import React, { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { ArrowLeft, Mail, LockKeyhole } from "lucide-react-native";
import { account, configurationError } from "../lib/appwrite";
import {
  completePasswordRecovery,
  passwordRecoveryUrl,
  requestPasswordRecovery,
  type RecoveryCredentials,
} from "../lib/passwordRecovery";
import { T, Field, Button, Banner, IconButton } from "./primitives";
import { colors as c, font } from "./theme";

export function PasswordRecovery({
  initialMode,
  credentials,
  initialEmail,
  onBack,
}: {
  initialMode: "request" | "reset";
  credentials: RecoveryCredentials | null;
  initialEmail: string;
  onBack: () => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const working = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit() {
    if (working.current || done) return;
    const problem = configurationError();
    if (problem) {
      setMessage(
        "Password recovery is unavailable while Circle’s connection is not configured.",
      );
      return;
    }
    working.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result =
        mode === "request"
          ? await requestPasswordRecovery(account, email, passwordRecoveryUrl())
          : await completePasswordRecovery(
              account,
              credentials,
              password,
              confirmation,
            );
      if (!mounted.current) return;
      setMessage(result.message);
      if (result.ok) {
        setDone(true);
        setPassword("");
        setConfirmation("");
      }
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  }
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
      <View
        style={{
          maxWidth: 430,
          width: "100%",
          alignSelf: "center",
          gap: 18,
          paddingVertical: 25,
        }}
      >
        <IconButton
          icon={ArrowLeft}
          label="Back to sign in"
          onPress={busy ? undefined : onBack}
          style={{ alignSelf: "flex-start" }}
        />
        <LockKeyhole size={28} color={c.teal} />
        <T
          style={{
            fontFamily: font.heading,
            fontSize: 30,
            letterSpacing: -0.7,
          }}
        >
          {mode === "request"
            ? "Forgot your password?"
            : "Choose a new password."}
        </T>
        <T style={{ color: c.muted, lineHeight: 22 }}>
          {mode === "request"
            ? "Enter your account’s email address and we’ll help you reset it."
            : "Use a new password with at least 8 characters. This won’t sign you in automatically."}
        </T>
        {!!message && <Banner text={message} />}
        {mode === "reset" && !credentials && !done && (
          <Banner text="This reset link is incomplete. Request a new link below." />
        )}
        {!done &&
          (mode === "request" ? (
            <Field
              label="Email address"
              value={email}
              onChangeText={setEmail}
              editable={!busy}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              maxLength={320}
            />
          ) : credentials ? (
            <>
              <Field
                label="New password"
                value={password}
                onChangeText={setPassword}
                editable={!busy}
                secureTextEntry
                autoComplete="new-password"
                placeholder="At least 8 characters"
                maxLength={256}
              />
              <Field
                label="Confirm new password"
                value={confirmation}
                onChangeText={setConfirmation}
                editable={!busy}
                secureTextEntry
                autoComplete="new-password"
                placeholder="Enter it again"
                maxLength={256}
              />
            </>
          ) : null)}
        {!done && (mode === "request" || !!credentials) && (
          <Button
            icon={mode === "request" ? Mail : LockKeyhole}
            onPress={() => void submit()}
            disabled={
              busy ||
              (mode === "request" ? !email.trim() : !password || !confirmation)
            }
          >
            {busy
              ? "One moment…"
              : mode === "request"
                ? "Send reset link"
                : "Reset password"}
          </Button>
        )}
        {mode === "reset" && !done && (
          <Button
            secondary
            disabled={busy}
            onPress={() => {
              setMode("request");
              setMessage("");
              setPassword("");
              setConfirmation("");
            }}
          >
            Request a new reset link
          </Button>
        )}
        <Button secondary disabled={busy} onPress={onBack}>
          Back to sign in
        </Button>
        {mode === "request" && (
          <T style={{ fontSize: 12, color: c.muted, lineHeight: 19 }}>
            Reset links expire after one hour. If you came from an invitation,
            return to that invitation after resetting your password.
          </T>
        )}
      </View>
    </ScrollView>
  );
}
