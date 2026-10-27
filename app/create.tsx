import React, { useState } from "react";
import { View, Image, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import {
  Image as ImageIcon,
  Video as VideoIcon,
  ArrowLeft,
  LockKeyhole,
  Check,
  Send,
  X,
} from "lucide-react-native";
import { useCircle } from "../src/state/CircleProvider";
import {
  T,
  Avatar,
  Card,
  Button,
  Field,
  Banner,
  Empty,
  IconButton,
  CircleAvatar,
} from "../src/ui/primitives";
import { Video } from "../src/ui/PostCard";
import { colors as c, font } from "../src/ui/theme";
export default function CreatePost() {
  const { joinedCircles, user, actions, mode } = useCircle();
  const { circleId } = useLocalSearchParams<{ circleId?: string }>();
  const [circle, setCircle] = useState(circleId || joinedCircles[0]?.id || "");
  const [content, setContent] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<{
    uri: string;
    type: "image" | "video";
    duration?: number;
  } | null>(null);
  const router = useRouter();
  async function pick(type: "images" | "videos") {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Allow photo library access to choose something to share.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: [type],
        quality: 0.85,
        exif: false,
        videoMaxDuration: 60,
      });
      if (result.canceled) return;
      const a = result.assets[0];
      if ((a.fileSize || 0) > 50 * 1024 * 1024)
        throw new Error("Please choose a file smaller than 50 MB.");
      if (a.type === "video" && (a.duration || 0) > 60_000)
        throw new Error("Please choose a video shorter than one minute.");
      if (a.type === "video") {
        setMedia({
          uri: a.uri,
          type: "video",
          duration: a.duration || undefined,
        });
      } else {
        const clean = await ImageManipulator.manipulateAsync(
          a.uri,
          [{ resize: { width: 1600 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
        );
        setMedia({ uri: clean.uri, type: "image" });
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not choose your media.");
    }
  }
  async function publish() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await actions.createPost({
        circleId: circle,
        content,
        media: media?.uri,
        mediaType: media?.type,
        mediaDurationMs: media?.duration,
      });
      if (r.ok) router.replace(("/post/" + r.id) as never);
      else setError(r.error || "Could not share your moment.");
    } finally {
      setBusy(false);
    }
  }
  if (!joinedCircles.length)
    return (
      <Empty
        title="Find your people first"
        body="Join or create a Circle, then share your first moment."
      >
        <Button onPress={() => router.push("/circles")}>Explore Circles</Button>
      </Empty>
    );
  return (
    <View style={{ width: "100%", maxWidth: 730, alignSelf: "center" }}>
      <Pressable
        onPress={() => router.back()}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          marginBottom: 24,
        }}
      >
        <ArrowLeft size={16} color={c.teal} />
        <T style={{ color: c.teal, fontSize: 12 }}>Back to your people</T>
      </Pressable>
      <T style={{ fontFamily: font.extra, fontSize: 30, letterSpacing: -1 }}>
        Everyday, worth sharing.
      </T>
      <T
        style={{
          color: c.muted,
          marginTop: 9,
          marginBottom: 26,
          lineHeight: 22,
        }}
      >
        A big milestone, a small thought, or just a little hello.
      </T>
      {!!error && <Banner text={error} onDismiss={() => setError("")} />}
      <Card style={{ padding: 24 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 11,
            marginBottom: 25,
          }}
        >
          <Avatar name={user?.name || "You"} uri={user?.avatar} size={42} />
          <View>
            <T style={{ fontFamily: font.bold }}>{user?.name}</T>
            <T style={{ fontSize: 11, color: c.muted, marginTop: 5 }}>
              Sharing with your Circle
            </T>
          </View>
        </View>
        <T style={{ fontFamily: font.bold, fontSize: 12, marginBottom: 12 }}>
          Choose your little world
        </T>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 22,
          }}
        >
          {joinedCircles.map((x) => (
            <Pressable
              key={x.id}
              onPress={() => setCircle(x.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                padding: 10,
                borderRadius: 9,
                backgroundColor: circle === x.id ? c.mint : c.bg,
                borderWidth: 1,
                borderColor: circle === x.id ? "#ACCEB7" : c.line,
              }}
            >
              <CircleAvatar avatar={x.avatar} color="transparent" size={19} />
              <T style={{ fontSize: 12 }}>{x.name}</T>
              {circle === x.id && <Check size={13} color={c.teal} />}
            </Pressable>
          ))}
        </View>
        <Field
          accessibilityLabel="Post content"
          placeholder="What’s on your mind?"
          value={content}
          onChangeText={setContent}
          multiline
          maxLength={5000}
          style={{ minHeight: 170, backgroundColor: "white" }}
        />
        {media && (
          <View
            style={{ borderRadius: 12, overflow: "hidden", marginBottom: 18 }}
          >
            {media.type === "video" ? (
              <Video uri={media.uri} />
            ) : (
              <Image
                source={{ uri: media.uri }}
                style={{ width: "100%", height: 280 }}
              />
            )}
            <IconButton
              icon={X}
              label="Remove media"
              onPress={() => setMedia(null)}
              style={{
                position: "absolute",
                right: 8,
                top: 8,
                backgroundColor: "white",
              }}
            />
          </View>
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <Button secondary icon={ImageIcon} onPress={() => pick("images")}>
            Photo
          </Button>
          <Button secondary icon={VideoIcon} onPress={() => pick("videos")}>
            Short video
          </Button>
        </View>
        <View
          style={{
            borderTopWidth: 1,
            borderColor: c.line,
            paddingTop: 20,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 14,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              gap: 7,
              alignItems: "center",
              flex: 1,
            }}
          >
            <LockKeyhole size={13} color={c.muted} />
            <T style={{ fontSize: 10, lineHeight: 16, color: c.muted }}>
              {mode === "demo"
                ? "Saved on this device only."
                : "Visible only to approved Circle members."}
            </T>
          </View>
          <Button
            icon={Send}
            disabled={busy || (!content.trim() && !media) || !circle}
            onPress={publish}
          >
            {busy ? "Sharing…" : "Share moment"}
          </Button>
        </View>
      </Card>
    </View>
  );
}
