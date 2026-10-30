import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
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
  Expand,
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
import { MediaImage, MediaViewer, Video } from "../src/ui/MediaViewer";
import {
  formatBytes,
  formatDuration,
  photoResize,
  PHOTO_JPEG_QUALITY,
  validateMedia,
  VIDEO_MAX_DURATION_MS,
} from "../src/lib/media";
import type { UploadProgress } from "../src/lib/media";
import { colors as c, font } from "../src/ui/theme";

interface ChosenMedia {
  uri: string;
  type: "image" | "video";
  width: number;
  height: number;
  duration?: number;
  bytes?: number;
  name?: string;
  mimeType?: string;
}

/** Expo supplies duration on native; browsers may need to read container metadata. */
async function videoDuration(
  uri: string,
  provided?: number | null,
): Promise<number | undefined> {
  // Expo SDK 54's web picker returns seconds while native returns milliseconds.
  // Read the browser container directly so a 90-second clip cannot pass as 90ms.
  if (Platform.OS !== "web")
    return provided && Number.isFinite(provided) ? provided : undefined;
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const finish = (duration?: number) => {
      clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      resolve(duration);
    };
    const timeout = setTimeout(() => finish(), 10000);
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      finish(
        Number.isFinite(video.duration) ? video.duration * 1000 : undefined,
      );
    video.onerror = () => finish();
    video.src = uri;
  });
}

export default function CreatePost() {
  const { joinedCircles, user, actions, mode } = useCircle();
  const { circleId } = useLocalSearchParams<{ circleId?: string }>();
  const [circle, setCircle] = useState(circleId || joinedCircles[0]?.id || "");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [stage, setStage] = useState<"idle" | "preparing" | "sharing">("idle");
  const [media, setMedia] = useState<ChosenMedia | null>(null);
  const [viewer, setViewer] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  );
  const uploadController = useRef<AbortController | null>(null);
  useEffect(() => () => uploadController.current?.abort(), []);
  const router = useRouter();
  const busy = stage !== "idle";
  const chosenCircle = joinedCircles.find((x) => x.id === circle);
  async function pick(type: "images" | "videos") {
    if (busy) return;
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Allow photo library access to choose something to share.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: [type],
        quality: 1,
        exif: false,
        videoMaxDuration: VIDEO_MAX_DURATION_MS / 1000,
        allowsEditing: false,
        videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
      });
      if (result.canceled) return;
      setStage("preparing");
      setError("");
      const a = result.assets[0];
      const isVideo = a.type === "video";
      const duration = isVideo
        ? await videoDuration(a.uri, a.duration)
        : undefined;
      const validation = validateMedia({
        type: isVideo ? "video" : "image",
        bytes: a.fileSize,
        durationMs: duration,
        mimeType: isVideo ? a.mimeType : undefined,
      });
      if (validation) throw new Error(validation);
      if (isVideo) {
        setMedia({
          uri: a.uri,
          type: "video",
          width: a.width,
          height: a.height,
          duration,
          bytes: a.fileSize,
          name: a.fileName || undefined,
          mimeType: a.mimeType || undefined,
        });
      } else {
        const resize = photoResize(a.width, a.height);
        const clean = await ImageManipulator.manipulateAsync(
          a.uri,
          resize ? [{ resize }] : [],
          {
            compress: PHOTO_JPEG_QUALITY,
            format: ImageManipulator.SaveFormat.JPEG,
          },
        );
        setMedia({
          uri: clean.uri,
          type: "image",
          width: clean.width,
          height: clean.height,
          name: a.fileName || undefined,
        });
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not choose your media. Please try another file.",
      );
    } finally {
      setStage("idle");
    }
  }
  async function publish() {
    if (busy) return;
    setStage("sharing");
    setError("");
    setUploadProgress(null);
    uploadController.current = new AbortController();
    try {
      const result = await actions.createPost({
        circleId: circle,
        content,
        media: media?.uri,
        mediaType: media?.type,
        mediaDurationMs: media?.duration,
        mediaMimeType: media?.mimeType,
        onUploadProgress: setUploadProgress,
        uploadSignal: uploadController.current.signal,
      });
      if (result.ok) router.replace(("/post/" + result.id) as never);
      else
        setError(
          result.error ||
            "Could not share your moment. Your draft is still here.",
        );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not share your moment. Your draft is still here.",
      );
    } finally {
      uploadController.current = null;
      setStage("idle");
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
        accessibilityRole="button"
        onPress={() => router.back()}
        style={s.back}
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
        <View style={s.author}>
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
        <View style={s.circles}>
          {joinedCircles.map((x) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: circle === x.id, disabled: busy }}
              disabled={busy}
              key={x.id}
              onPress={() => setCircle(x.id)}
              style={[
                s.circle,
                {
                  backgroundColor: circle === x.id ? c.mint : c.bg,
                  borderColor: circle === x.id ? "#ACCEB7" : c.line,
                },
              ]}
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
          editable={!busy}
          multiline
          maxLength={5000}
          style={{ minHeight: 150, backgroundColor: "white" }}
        />
        {media && (
          <View style={s.preview}>
            <View style={{ position: "relative" }}>
              {media.type === "video" ? (
                <Video
                  uri={media.uri}
                  label="Selected video preview"
                  height={
                    media.width > 0 && media.height > 0
                      ? Math.min(
                          430,
                          Math.max(250, (600 * media.height) / media.width),
                        )
                      : 340
                  }
                />
              ) : (
                <MediaImage
                  uri={media.uri}
                  label="Selected photo preview"
                  dimensions={media}
                  onPress={() => setViewer(true)}
                />
              )}
              {!busy && (
                <IconButton
                  icon={X}
                  label="Remove media"
                  onPress={() => setMedia(null)}
                  style={s.remove}
                />
              )}
            </View>
            <View style={s.previewFooter}>
              <View
                style={{
                  width: 29,
                  height: 29,
                  borderRadius: 9,
                  backgroundColor: c.mint,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {media.type === "video" ? (
                  <VideoIcon size={14} color={c.teal} />
                ) : (
                  <ImageIcon size={14} color={c.teal} />
                )}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <T style={{ fontFamily: font.bold, fontSize: 11 }}>
                  {media.type === "video"
                    ? "A little motion"
                    : "A moment, beautifully kept"}
                </T>
                <T style={{ fontSize: 10, color: c.muted }}>
                  {media.type === "video"
                    ? `${formatDuration(media.duration || 0)}${media.bytes ? ` · ${formatBytes(media.bytes)}` : ""} · Sound starts muted`
                    : `${media.width} × ${media.height} · Full photo, no crop`}
                </T>
              </View>
              {media.type === "image" && (
                <IconButton
                  icon={Expand}
                  label="Preview photo full screen"
                  onPress={() => setViewer(true)}
                />
              )}
            </View>
          </View>
        )}
        {stage === "preparing" && (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Preparing your media"
            style={s.progress}
          >
            <ActivityIndicator size="small" color={c.teal} />
            <View>
              <T style={{ fontFamily: font.bold, fontSize: 12 }}>
                Preparing your moment…
              </T>
              <T style={{ color: c.muted, fontSize: 11, marginTop: 3 }}>
                Keeping the details worth remembering.
              </T>
            </View>
          </View>
        )}
        <View style={s.attachments}>
          <Button
            secondary
            icon={ImageIcon}
            disabled={busy}
            onPress={() => pick("images")}
          >
            Photo
          </Button>
          <Button
            secondary
            icon={VideoIcon}
            disabled={busy}
            onPress={() => pick("videos")}
          >
            Video
          </Button>
          <T
            style={{
              fontSize: 10,
              color: c.muted,
              lineHeight: 17,
              flexShrink: 1,
            }}
          >
            Photos up to 200 MB{"\n"}Videos up to 10 minutes · 250 MB
          </T>
        </View>
        {media?.type === "video" && (
          <T
            style={{
              fontSize: 10,
              color: c.muted,
              lineHeight: 17,
              marginBottom: 18,
            }}
          >
            Before sharing, check your clip for personal details you’d like to
            keep to yourself. Original video metadata may remain in the file.
          </T>
        )}
        <View style={s.publish}>
          <View
            style={{
              flexDirection: "row",
              gap: 7,
              alignItems: "center",
              flex: 1,
            }}
          >
            <LockKeyhole size={13} color={c.muted} />
            <T
              style={{ fontSize: 10, lineHeight: 16, color: c.muted, flex: 1 }}
            >
              {mode === "demo"
                ? "Saved on this device only."
                : `Only approved members of ${chosenCircle?.name || "your Circle"} can see this.`}
            </T>
          </View>
          <Button
            icon={Send}
            disabled={busy || (!content.trim() && !media) || !chosenCircle}
            onPress={publish}
          >
            {stage === "sharing"
              ? mode === "demo"
                ? "Saving…"
                : "Sharing…"
              : stage === "preparing"
                ? "Preparing…"
                : "Share moment"}
          </Button>
        </View>
        {stage === "sharing" && (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={
              mode === "demo"
                ? "Saving your moment"
                : uploadProgress
                  ? `Uploading your media: ${Math.round((uploadProgress.uploaded / uploadProgress.total) * 100)} percent`
                  : "Uploading and sharing your moment"
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
              marginTop: 17,
            }}
          >
            <ActivityIndicator size="small" color={c.teal} />
            <T
              style={{ color: c.muted, fontSize: 11, flex: 1, lineHeight: 17 }}
            >
              {mode === "demo"
                ? "Saving your moment on this device…"
                : media
                  ? uploadProgress
                    ? uploadProgress.uploaded === uploadProgress.total
                      ? "Upload complete. Sharing with your Circle…"
                      : `Uploading ${formatBytes(uploadProgress.uploaded)} of ${formatBytes(uploadProgress.total)} (${Math.round((uploadProgress.uploaded / uploadProgress.total) * 100)}%)…`
                    : "Preparing your upload…"
                  : "Sharing with your Circle…"}
            </T>
            {mode !== "demo" &&
              media &&
              (!uploadProgress ||
                uploadProgress.uploaded < uploadProgress.total) && (
                <Button
                  secondary
                  onPress={() => uploadController.current?.abort()}
                >
                  Cancel upload
                </Button>
              )}
          </View>
        )}
      </Card>
      {media && (
        <MediaViewer
          visible={viewer}
          onClose={() => setViewer(false)}
          uri={media.uri}
          type={media.type}
          caption={content || "Your moment, ready to share."}
          author={user?.name}
        />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 24,
  },
  author: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 25,
  },
  circles: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 22 },
  circle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 10,
    borderRadius: 9,
    borderWidth: 1,
  },
  preview: {
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 18,
    borderWidth: 1,
    borderColor: c.line,
  },
  remove: {
    position: "absolute",
    right: 10,
    top: 10,
    backgroundColor: "#FFFFFFEF",
    borderRadius: 20,
  },
  previewFooter: {
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FAFCF9",
  },
  attachments: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
  },
  publish: {
    borderTopWidth: 1,
    borderColor: c.line,
    paddingTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
  },
  progress: {
    padding: 18,
    marginBottom: 18,
    backgroundColor: c.mint,
    borderRadius: 12,
    flexDirection: "row",
    gap: 13,
    alignItems: "center",
  },
});
