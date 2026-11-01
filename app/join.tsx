import React, { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  KeyRound,
  ArrowRight,
  Lock,
  Check,
} from "lucide-react-native";
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
import {
  invitationAuthRoute,
  invitationCodeFromFragment,
  invitationCodeFromUrl,
} from "../src/lib/inviteLinks";
export default function JoinCircle() {
  const { actions, user } = useCircle();
  const params = useLocalSearchParams<{ "#"?: string }>();
  const fragment = typeof params["#"] === "string" ? params["#"] : "";
  const [code, setCode] = useState(() => invitationCodeFromFragment(fragment));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [joinedCircleId, setJoinedCircleId] = useState<string | null>(null);
  const sequence = useRef(0);
  const scope = useRef({ userId: user?.id, fragment });
  scope.current = { userId: user?.id, fragment };
  useEffect(() => {
    ++sequence.current;
    setCode(invitationCodeFromFragment(fragment));
    setError("");
    setBusy(false);
    setJoinedCircleId(null);
  }, [fragment]);
  useEffect(() => {
    ++sequence.current;
    setError("");
    setBusy(false);
    setJoinedCircleId(null);
  }, [user?.id]);
  useEffect(
    () => () => {
      ++sequence.current;
    },
    [],
  );
  const validCode = invitationCodeFromUrl(code);
  async function join() {
    if (busy || !user) return;
    const requestedCode = invitationCodeFromUrl(code);
    if (!requestedCode) {
      setError(
        "Enter an invitation code or paste your Circle invitation link.",
      );
      return;
    }
    const attempt = ++sequence.current;
    const requestedScope = { ...scope.current };
    const current = () =>
      attempt === sequence.current &&
      requestedScope.userId === scope.current.userId &&
      requestedScope.fragment === scope.current.fragment;
    setBusy(true);
    setError("");
    try {
      const result = await actions.redeemInvitation(requestedCode);
      if (!current()) return;
      if (result.ok && result.id) setJoinedCircleId(result.id);
      else
        setError(
          result.error ||
            "This invitation could not be used. Check the code and try again.",
        );
    } catch {
      if (current())
        setError("We could not check this invitation. Please try again.");
    } finally {
      if (current()) setBusy(false);
    }
  }
  const content = (
    <View
      style={{
        maxWidth: 530,
        width: "100%",
        alignSelf: "center",
        gap: 24,
        ...(!user ? { padding: 20, marginVertical: 24 } : {}),
      }}
    >
      <IconButton
        icon={ArrowLeft}
        label={user ? "Back to Circles" : "Back to welcome"}
        onPress={() => router.replace(user ? "/circles" : "/welcome")}
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
          {joinedCircleId ? (
            <Check size={29} color={c.teal} />
          ) : (
            <KeyRound size={29} color={c.teal} />
          )}
        </View>
        <View style={{ gap: 10 }}>
          <T
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            style={{
              fontFamily: font.extra,
              fontSize: 29,
              letterSpacing: -0.8,
            }}
          >
            {joinedCircleId ? "Invitation accepted" : "Have an invitation?"}
          </T>
          <T style={{ color: c.muted, lineHeight: 23 }}>
            {joinedCircleId
              ? "You’ve joined the Circle. Your membership is confirmed, and you can open its memories and chat."
              : user
                ? "Enter a private invitation code or paste an invitation link to join their Circle."
                : "Sign in or create your Circle account, then choose whether to use this private invitation. Nothing is joined automatically."}
          </T>
        </View>
        {error ? <Banner text={error} onDismiss={() => setError("")} /> : null}
        {joinedCircleId ? (
          <Button
            icon={ArrowRight}
            onPress={() =>
              router.replace({
                pathname: "/circle/[id]",
                params: { id: joinedCircleId },
              })
            }
          >
            Open Circle
          </Button>
        ) : (
          <>
            <Field
              label="Invitation code"
              accessibilityLabel="Invitation code"
              value={code}
              onChangeText={(value) => {
                ++sequence.current;
                setCode(value);
                setError("");
              }}
              editable={!busy}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Enter a code or paste an invitation link"
              maxLength={2048}
              onSubmitEditing={user ? join : undefined}
            />
            {!!code && !validCode && (
              <T style={{ color: c.muted, fontSize: 12, lineHeight: 19 }}>
                Use a valid invitation code or a Circle invitation link.
              </T>
            )}
            {user ? (
              <Button
                disabled={!validCode || busy}
                icon={ArrowRight}
                onPress={join}
              >
                {busy ? "Checking your invitation…" : "Join the Circle"}
              </Button>
            ) : (
              <View style={{ gap: 12 }}>
                <Button
                  icon={ArrowRight}
                  disabled={!!code && !validCode}
                  onPress={() =>
                    router.replace(invitationAuthRoute("signin", validCode))
                  }
                >
                  Sign in to use invitation
                </Button>
                <Button
                  secondary
                  disabled={!!code && !validCode}
                  onPress={() =>
                    router.replace(invitationAuthRoute("signup", validCode))
                  }
                >
                  Create an account to join
                </Button>
              </View>
            )}
          </>
        )}
        <View style={{ flexDirection: "row", gap: 9, alignItems: "center" }}>
          <Lock size={13} color={c.muted} />
          <T style={{ color: c.muted, fontSize: 11, flex: 1, lineHeight: 18 }}>
            {joinedCircleId
              ? "Your invitation was accepted. This screen does not show private Circle content."
              : "Each invitation can be used once and expires after 7 days. Circle content stays private until you sign in and use a valid invitation."}
          </T>
        </View>
      </Card>
    </View>
  );
  return user ? (
    content
  ) : (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </ScrollView>
  );
}
