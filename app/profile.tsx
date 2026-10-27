import React, { useState } from "react";
import { View, Pressable, StyleSheet, Modal, Image } from "react-native";
import { router } from "expo-router";
import {
  Camera,
  Check,
  ChevronRight,
  LogOut,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useCircle } from "../src/state/CircleProvider";
import {
  T,
  Avatar,
  Card,
  Button,
  Field,
  Banner,
  IconButton,
  SectionTitle,
  Loading,
} from "../src/ui/primitives";
import { colors as c, font } from "../src/ui/theme";

export default function Profile() {
  const { user, joinedCircles, actions, state, mode, ready } = useCircle();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [avatar, setAvatar] = useState(user?.avatar || "");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (!ready) return <Loading />;
  if (!user)
    return (
      <View style={{ padding: 28 }}>
        <T>Sign in to see your profile.</T>
        <Button onPress={() => router.push("/auth")}>Sign in</Button>
      </View>
    );
  const beginEdit = () => {
    setName(user.name);
    setUsername(user.username);
    setBio(user.bio);
    setAvatar(user.avatar);
    setEditing(true);
    setNotice("");
  };
  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice("Allow photo access to choose a profile photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      exif: false,
    });
    if (result.canceled) return;
    try {
      const sanitized = await manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 512 } }],
        { compress: 0.85, format: SaveFormat.JPEG },
      );
      setAvatar(sanitized.uri);
    } catch {
      setNotice("That photo could not be processed. Please choose another.");
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      const result = await actions.updateProfile({
        name,
        username,
        bio,
        avatar,
      });
      if (result.ok) {
        setEditing(false);
        setNotice("Your profile is looking good. Changes saved.");
      } else setNotice(result.error || "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    const result = await actions.signOut();
    if (result.ok) router.replace("/welcome");
    else setNotice(result.error || "Could not sign out.");
  };
  const deleteAccount = async () => {
    setBusy(true);
    try {
      const result = await actions.deleteAccount();
      if (result.ok) {
        setConfirm(false);
        router.replace("/welcome");
      } else {
        setConfirm(false);
        setNotice(result.error || "Could not delete your account.");
      }
    } finally {
      setBusy(false);
    }
  };
  const ownCircles = joinedCircles.filter((x) => x.ownerId === user.id).length;
  const posts = state.posts.filter((x) => x.authorId === user.id).length;
  return (
    <View
      style={{
        maxWidth: 800,
        width: "100%",
        alignSelf: "center",
        gap: 23,
        paddingBottom: 30,
      }}
    >
      <View>
        <T
          style={{
            fontFamily: font.heading,
            fontSize: 27,
            letterSpacing: -0.8,
          }}
        >
          Your little corner
        </T>
        <T style={{ color: c.muted, marginTop: 7 }}>
          A familiar face. A few favorite people. All you.
        </T>
      </View>
      {!!notice && <Banner text={notice} onDismiss={() => setNotice("")} />}
      <Card>
        <View style={styles.cover}>
          <View style={styles.coverRing} />
          <View
            style={[
              styles.coverRing,
              { left: 115, top: -100, width: 240, height: 240 },
            ]}
          />
          <View
            style={[
              styles.coverRing,
              { left: 305, top: 35, width: 160, height: 160 },
            ]}
          />
          <T
            style={{
              fontFamily: font.medium,
              fontSize: 12,
              color: "#7B9E8C",
              letterSpacing: 2,
              position: "absolute",
              right: 27,
              bottom: 24,
            }}
          >
            EVERY LITTLE MOMENT MATTERS.
          </T>
        </View>
        <View style={{ padding: 26, paddingTop: 0 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              justifyContent: "space-between",
              marginTop: -38,
              marginBottom: 17,
            }}
          >
            <View
              style={{ padding: 5, backgroundColor: "white", borderRadius: 50 }}
            >
              <Avatar uri={user.avatar} name={user.name} size={80} />
            </View>
            <Button secondary onPress={beginEdit}>
              Edit profile
            </Button>
          </View>
          <T
            style={{
              fontFamily: font.heading,
              fontSize: 25,
              letterSpacing: -0.6,
            }}
          >
            {user.name}
          </T>
          <T style={{ color: c.muted, fontSize: 12, marginTop: 4 }}>
            @{user.username}
          </T>
          <T style={{ marginTop: 17, lineHeight: 23, color: "#6F8177" }}>
            {user.bio || "A little about you helps your people feel closer."}
          </T>
          <View
            style={{
              flexDirection: "row",
              gap: 36,
              marginTop: 25,
              paddingTop: 22,
              borderTopWidth: 1,
              borderColor: c.line,
            }}
          >
            <View>
              <T style={styles.stat}>{joinedCircles.length}</T>
              <T style={styles.statLabel}>Circles</T>
            </View>
            <View>
              <T style={styles.stat}>{posts}</T>
              <T style={styles.statLabel}>Moments shared</T>
            </View>
            <View style={{ marginLeft: "auto", justifyContent: "center" }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <ShieldCheck size={15} color={c.teal} />
                <T style={{ fontSize: 11, color: c.teal }}>Adult account</T>
              </View>
            </View>
          </View>
        </View>
      </Card>
      {editing && (
        <Card style={{ padding: 25 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <T style={{ fontFamily: font.heading, fontSize: 18 }}>
              A little about you
            </T>
            <IconButton
              icon={X}
              label="Cancel editing"
              onPress={() => setEditing(false)}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={pickPhoto}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              marginBottom: 25,
            }}
          >
            <Avatar uri={avatar} name={name || user.name} size={58} />
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
            >
              <Camera size={16} color={c.teal} />
              <T style={{ color: c.teal, fontFamily: font.bold, fontSize: 12 }}>
                Choose a photo
              </T>
            </View>
          </Pressable>
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            maxLength={80}
          />
          <Field
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            maxLength={24}
          />
          <Field
            label="Bio"
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={280}
            placeholder="What makes you, you?"
          />
          <Button disabled={busy} icon={Check} onPress={save}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </Card>
      )}
      <View>
        <SectionTitle
          title="Your Circles"
          action="See all"
          onPress={() => router.push("/circles")}
        />
        <Card>
          {joinedCircles.map((circle, i) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/circle/${circle.id}`)}
              key={circle.id}
              style={({ pressed }) => [
                {
                  padding: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  borderTopWidth: i ? 1 : 0,
                  borderColor: c.line,
                },
                pressed && { backgroundColor: c.bg },
              ]}
            >
              <View
                style={{
                  backgroundColor: circle.color,
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {circle.avatar.startsWith("http") ||
                circle.avatar.startsWith("file:") ||
                circle.avatar.startsWith("data:") ||
                circle.avatar.startsWith("/") ? (
                  <Image
                    source={{ uri: circle.avatar }}
                    style={{ width: 42, height: 42, borderRadius: 13 }}
                  />
                ) : (
                  <T style={{ fontSize: 22 }}>{circle.avatar}</T>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: font.bold, fontSize: 13 }}>
                  {circle.name}
                </T>
                <T style={{ color: c.muted, fontSize: 11, marginTop: 3 }}>
                  {
                    state.members.find(
                      (x) => x.circleId === circle.id && x.userId === user.id,
                    )?.role
                  }{" "}
                  · {circle.category}
                </T>
              </View>
              <ChevronRight color={c.muted} size={17} />
            </Pressable>
          ))}
          {!joinedCircles.length && (
            <T style={{ color: c.muted, padding: 24 }}>
              Your people are out there. Create or join your first Circle.
            </T>
          )}
        </Card>
      </View>
      <Card style={{ padding: 22, gap: 17 }}>
        <T style={{ fontFamily: font.heading, fontSize: 16 }}>
          Account & privacy
        </T>
        <View
          style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
        >
          <ShieldCheck size={19} color={c.teal} />
          <T style={{ fontSize: 12, color: c.muted, lineHeight: 20, flex: 1 }}>
            {mode === "demo"
              ? "You’re in the interactive local demo. Accounts and content are stored on this device, without real authentication or multi-user privacy."
              : "Your Circle content is available only to approved members. Previously shared or downloaded media cannot be recalled."}
          </T>
        </View>
        <View style={{ height: 1, backgroundColor: c.line }} />
        <Pressable
          accessibilityRole="button"
          onPress={signOut}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 6,
          }}
        >
          <LogOut color={c.ink} size={17} />
          <T style={{ fontSize: 13, fontFamily: font.medium }}>Sign out</T>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirm(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 6,
          }}
        >
          <Trash2 color={c.red} size={17} />
          <T style={{ fontSize: 13, color: c.red }}>Delete account</T>
        </Pressable>
      </Card>
      <Modal
        visible={confirm}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirm(false)}
      >
        <View style={styles.scrim}>
          <View style={styles.dialog}>
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                backgroundColor: "#F8E9E7",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 18,
              }}
            >
              <Trash2 size={21} color={c.red} />
            </View>
            <T style={{ fontFamily: font.heading, fontSize: 21 }}>
              Leave Circle for good?
            </T>
            <T
              style={{
                color: c.muted,
                lineHeight: 22,
                marginTop: 12,
                marginBottom: 22,
              }}
            >
              This permanently deletes your{" "}
              {mode === "demo" ? "local demo " : ""}account, your profile, and
              your contributions.
              {ownCircles > 0
                ? ` Your ${ownCircles} owned Circle${ownCircles > 1 ? "s" : ""} and all content inside will also be deleted.`
                : ""}{" "}
              This cannot be undone.
            </T>
            <Button
              disabled={busy}
              onPress={deleteAccount}
              style={{ backgroundColor: c.red }}
            >
              {busy ? "Deleting…" : "Permanently delete account"}
            </Button>
            <Button
              secondary
              onPress={() => setConfirm(false)}
              style={{ marginTop: 10 }}
            >
              Keep my account
            </Button>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  cover: { height: 138, backgroundColor: "#E0EDE1", overflow: "hidden" },
  coverRing: {
    position: "absolute",
    left: -35,
    top: -80,
    width: 270,
    height: 270,
    borderRadius: 140,
    borderWidth: 34,
    borderColor: "#CDDFCC80",
  },
  stat: { fontFamily: font.heading, fontSize: 22 },
  statLabel: { fontSize: 11, color: c.muted, marginTop: 4 },
  scrim: {
    flex: 1,
    backgroundColor: "#153A3466",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 410,
    backgroundColor: "white",
    borderRadius: 22,
    padding: 28,
  },
});
