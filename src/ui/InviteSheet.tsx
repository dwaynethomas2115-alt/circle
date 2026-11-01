import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Copy,
  Link,
  LockKeyhole,
  Share2,
  UserPlus,
  X,
} from "lucide-react-native";
import { useCircle } from "../state/CircleProvider";
import { useCircleTheme, themeTint } from "../features/theme-context";
import {
  buildCircleAppUrl,
  buildCircleInviteUrl,
  normalizeInvitationCode,
} from "../lib/inviteLinks";
import { copyLink, shareLink, type ShareLinkResult } from "../lib/share";
import { Banner, Button, Card, IconButton, T } from "./primitives";
import { colors, font } from "./theme";

interface Invitation {
  scope: string;
  code: string;
  url: string;
}
interface Operation {
  scope: string;
  id: number;
}

export function InviteSheet({
  visible,
  onClose,
  circleId,
}: {
  visible: boolean;
  onClose: () => void;
  circleId?: string;
}) {
  const { state, user, actions, mode } = useCircle();
  const theme = useCircleTheme();
  const { width } = useWindowDimensions();
  const circle = state.circles.find((item) => item.id === circleId);
  const membership = state.members.find(
    (item) => item.circleId === circleId && item.userId === user?.id,
  );
  const canInvite = Boolean(
    user &&
    circle &&
    membership &&
    ["owner", "admin"].includes(membership.role),
  );
  const scope = `${visible}:${user?.id || ""}:${circleId || ""}:${membership?.role || ""}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const sequence = useRef(0);
  const operation = useRef<Operation | null>(null);
  const [busy, setBusy] = useState<"create" | "share" | "copy" | null>(null);
  const [notice, setNotice] = useState("");
  const [created, setCreated] = useState<Invitation | null>(null);
  const invitation = canInvite && created?.scope === scope ? created : null;
  const appUrl = buildCircleAppUrl();

  useEffect(() => {
    operation.current = null;
    setCreated(null);
    setNotice("");
    setBusy(null);
    return () => {
      operation.current = null;
    };
  }, [scope]);

  function begin(kind: "create" | "share" | "copy") {
    if (!visible || !user || operation.current?.scope === scope) return null;
    const pending = { scope, id: ++sequence.current };
    operation.current = pending;
    setBusy(kind);
    setNotice("");
    return pending;
  }
  function current(pending: Operation) {
    return (
      activeScope.current === pending.scope &&
      operation.current?.id === pending.id
    );
  }
  function finish(pending: Operation) {
    if (!current(pending)) return;
    operation.current = null;
    setBusy(null);
  }
  function outcome(result: ShareLinkResult) {
    setNotice(
      result === "copied"
        ? "Link copied. Paste it into a message to the person you want to invite."
        : result === "cancelled"
          ? "Sharing cancelled. Your link is still here."
          : result === "manual"
            ? "Select or press and hold the link below to copy it, then paste it into your message."
            : "The share menu was opened. Your link is still here if you need it.",
    );
  }
  async function distribute(kind: "app" | "private", copy: boolean) {
    if (kind === "private" && (!canInvite || !invitation)) return;
    const url = kind === "private" ? invitation!.url : appUrl;
    const pending = begin(copy ? "copy" : "share");
    if (!pending) return;
    try {
      const result = copy
        ? await copyLink(url)
        : await shareLink({
            title:
              kind === "private"
                ? "A private Circle invitation"
                : "Join me on Circle",
            message:
              kind === "private"
                ? `You’re invited to ${circle!.name} on Circle. Open your private invitation to join us.`
                : "Join me on Circle, a private place for our photos and conversations.",
            url,
          });
      if (current(pending)) outcome(result);
    } catch {
      if (current(pending)) outcome("manual");
    } finally {
      finish(pending);
    }
  }
  async function createPrivateInvitation() {
    if (!canInvite || !circleId || invitation) return;
    const pending = begin("create");
    if (!pending) return;
    try {
      const result = await actions.createInvitation(circleId);
      if (!current(pending)) return;
      const code = normalizeInvitationCode(result.code);
      if (!result.ok || !code) {
        setNotice(
          result.error ||
            "Your invitation could not be created. Please try again.",
        );
        return;
      }
      setCreated({
        scope: pending.scope,
        code,
        url: buildCircleInviteUrl(code),
      });
      setNotice(
        "Your private invitation is ready. Share it with one person you want to join.",
      );
    } catch {
      if (current(pending))
        setNotice("Your invitation could not be created. Please try again.");
    } finally {
      finish(pending);
    }
  }

  function inviteAnotherPerson() {
    if (!canInvite || busy || operation.current?.scope === scope) return;
    setCreated(null);
    setNotice(
      "Create a separate invitation for the next person. Your previous link still works until it’s used or expires.",
    );
  }

  const appInvitationSection = (
    <Card style={s.section}>
      <View style={s.title}>
        <UserPlus size={19} color={theme.accent} />
        <T style={{ fontFamily: font.bold, fontSize: 16 }}>Invite to Circle</T>
      </View>
      <T style={s.description}>
        Share the Circle app. They can create an account and start their own
        Circles. This link doesn’t give access to your private groups.
      </T>
      <View style={s.buttons}>
        <Button
          icon={Share2}
          disabled={!!busy}
          onPress={() => void distribute("app", false)}
        >
          Share app link
        </Button>
        <Button
          secondary
          icon={Copy}
          disabled={!!busy}
          onPress={() => void distribute("app", true)}
        >
          Copy app link
        </Button>
      </View>
      <T
        selectable
        style={[s.link, { backgroundColor: themeTint(theme.accent, 0.05) }]}
      >
        {appUrl}
      </T>
    </Card>
  );
  const circleInvitationSection = canInvite ? (
    <Card style={s.section}>
      <View style={s.title}>
        <LockKeyhole size={19} color={theme.accent} />
        <T style={{ fontFamily: font.bold, fontSize: 16 }}>
          Invite to this Circle
        </T>
      </View>
      <T style={s.description}>
        Bring someone into {circle!.name}. Each private invitation works once
        and expires in 7 days.
      </T>
      {invitation ? (
        <>
          <View style={s.buttons}>
            <Button
              icon={Share2}
              disabled={!!busy}
              onPress={() => void distribute("private", false)}
            >
              Share private invitation
            </Button>
            <Button
              secondary
              icon={Copy}
              disabled={!!busy}
              onPress={() => void distribute("private", true)}
            >
              Copy private invitation link
            </Button>
          </View>
          <T
            selectable
            style={[s.link, { backgroundColor: themeTint(theme.accent, 0.05) }]}
          >
            {invitation.url}
          </T>
          <T style={{ fontSize: 11, color: colors.muted }}>
            Or share this invitation code:
          </T>
          <T
            selectable
            style={{
              fontSize: 14,
              fontFamily: font.bold,
              lineHeight: 22,
            }}
          >
            {invitation.code}
          </T>
          <View style={{ alignItems: "flex-start" }}>
            <Button
              secondary
              icon={UserPlus}
              disabled={!!busy}
              onPress={inviteAnotherPerson}
            >
              Invite another person
            </Button>
          </View>
        </>
      ) : (
        <View style={{ alignItems: "flex-start" }}>
          <Button
            icon={Link}
            disabled={!!busy}
            onPress={() => void createPrivateInvitation()}
          >
            {busy === "create"
              ? "Creating invitation…"
              : "Create private invitation"}
          </Button>
        </View>
      )}
      {mode === "demo" && (
        <T style={s.description}>
          Demo invitations work only with the sample accounts on this device.
        </T>
      )}
    </Card>
  ) : null;

  return (
    <Modal
      visible={visible && !!user}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.scrim}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close invitations"
        />
        <View
          testID="invite-people-sheet"
          accessibilityViewIsModal
          style={[
            s.sheet,
            { backgroundColor: theme.surface, padding: width < 600 ? 20 : 28 },
          ]}
        >
          <View style={s.heading}>
            <View style={{ flex: 1, gap: 5 }}>
              <T style={{ fontFamily: font.heading, fontSize: 23 }}>
                Invite your people
              </T>
              <T style={{ fontSize: 12, lineHeight: 19, color: colors.muted }}>
                A place for the people you want closer.
              </T>
            </View>
            <IconButton icon={X} label="Close invitations" onPress={onClose} />
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 18, paddingBottom: 2 }}
          >
            {!!notice && (
              <Banner text={notice} onDismiss={() => setNotice("")} />
            )}
            {circleInvitationSection}
            {appInvitationSection}
            {!canInvite && (
              <T style={s.description}>
                {circleId
                  ? "Only a Circle owner or admin can create its private invitations."
                  : "To invite someone into a specific Circle, open that Circle and choose Invite people."}
              </T>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "#153A3466",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 580,
    maxHeight: "92%",
    borderRadius: 24,
    gap: 22,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: 12 },
  section: { padding: 18, borderRadius: 16, gap: 13 },
  title: { flexDirection: "row", alignItems: "center", gap: 9 },
  description: { fontSize: 12, lineHeight: 20, color: colors.muted },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  link: {
    fontSize: 12,
    lineHeight: 20,
    padding: 12,
    borderRadius: 10,
    flexShrink: 1,
  },
});
