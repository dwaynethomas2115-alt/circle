import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import {
  Image as ImageIcon,
  Video as VideoIcon,
  ArrowLeft,
  ArrowRight,
  LockKeyhole,
  Check,
  Send,
  X,
  Expand,
  Plus,
  Layers,
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
import { MAX_POST_PHOTOS } from "../src/lib/postMedia";
import { colors as c, font } from "../src/ui/theme";

interface ChosenMedia {
  id: string;
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
  // The web picker reports seconds, while native reports milliseconds.
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
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const [circle, setCircle] = useState(circleId || joinedCircles[0]?.id || "");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [stage, setStage] = useState<
    "idle" | "choosing" | "preparing" | "sharing"
  >("idle");
  const [media, setMedia] = useState<ChosenMedia[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [viewer, setViewer] = useState(false);
  const [preparing, setPreparing] = useState({ current: 0, total: 0 });
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  );
  const uploadController = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const nextId = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadController.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!circle && joinedCircles[0]) setCircle(joinedCircles[0].id);
  }, [circle, joinedCircles]);
  const router = useRouter();
  const busy = stage !== "idle";
  const chosenCircle = joinedCircles.find((item) => item.id === circle);
  const selected = media.find((item) => item.id === activeId) || media[0];
  const selectedIndex = selected
    ? media.findIndex((item) => item.id === selected.id)
    : 0;
  const selectedRatio =
    selected && selected.width > 0 && selected.height > 0
      ? selected.width / selected.height
      : 1.5;
  const previewHeight = Math.min(
    compact ? 330 : 440,
    Math.max(200, (previewWidth || Math.min(728, width - 56)) / selectedRatio),
  );
  const hasVideo = media[0]?.type === "video";
  const progressFraction =
    uploadProgress && uploadProgress.total > 0
      ? Math.min(1, Math.max(0, uploadProgress.uploaded / uploadProgress.total))
      : 0;
  const itemCount = uploadProgress?.itemCount || media.length || 1;
  const itemIndex = uploadProgress?.itemIndex || 1;
  const overallProgress = Math.min(
    1,
    (itemIndex - 1 + progressFraction) / itemCount,
  );

  async function pick(type: "images" | "videos") {
    if (locked.current) return;
    if (type === "images" && hasVideo) {
      setError(
        "Remove your video before adding photos. Photos and videos have their own posts.",
      );
      return;
    }
    if (type === "videos" && media.length) {
      setError("Remove your photos before choosing a video.");
      return;
    }
    const remaining = MAX_POST_PHOTOS - media.length;
    if (type === "images" && remaining <= 0) return;
    locked.current = true;
    setStage("choosing");
    setError("");
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Allow photo library access to choose something to share.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: [type],
        allowsMultipleSelection: type === "images",
        selectionLimit: type === "images" ? remaining : 1,
        orderedSelection: type === "images",
        quality: 1,
        exif: false,
        videoMaxDuration: VIDEO_MAX_DURATION_MS / 1000,
        allowsEditing: false,
        videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
      });
      if (result.canceled || !mounted.current) return;
      if (type === "images" && result.assets.length > remaining)
        throw new Error(
          `You can add ${remaining} more ${remaining === 1 ? "photo" : "photos"} to this moment.`,
        );
      if (type === "videos" && result.assets.length !== 1)
        throw new Error("Choose one video for this moment.");
      setStage("preparing");
      const chosen: ChosenMedia[] = [];
      // Prepare one image at a time, keeping large source photos out of parallel decoders.
      for (const [index, asset] of result.assets.entries()) {
        if (!mounted.current) return;
        setPreparing({ current: index + 1, total: result.assets.length });
        const isVideo = type === "videos";
        const duration = isVideo
          ? await videoDuration(asset.uri, asset.duration)
          : undefined;
        const validation = validateMedia({
          type: isVideo ? "video" : "image",
          bytes: asset.fileSize,
          durationMs: duration,
          mimeType: isVideo ? asset.mimeType : undefined,
        });
        if (validation) throw new Error(validation);
        const id = `chosen-${++nextId.current}`;
        if (isVideo) {
          chosen.push({
            id,
            uri: asset.uri,
            type: "video",
            width: asset.width,
            height: asset.height,
            duration,
            bytes: asset.fileSize,
            name: asset.fileName || undefined,
            mimeType: asset.mimeType || undefined,
          });
        } else {
          const resize = photoResize(asset.width, asset.height);
          const clean = await ImageManipulator.manipulateAsync(
            asset.uri,
            resize ? [{ resize }] : [],
            {
              compress: PHOTO_JPEG_QUALITY,
              format: ImageManipulator.SaveFormat.JPEG,
            },
          );
          chosen.push({
            id,
            uri: clean.uri,
            type: "image",
            width: clean.width,
            height: clean.height,
            name: asset.fileName || undefined,
            mimeType: "image/jpeg",
          });
        }
      }
      if (!mounted.current) return;
      setMedia((previous) =>
        type === "images" ? [...previous, ...chosen] : chosen,
      );
      setActiveId(chosen[0]?.id || null);
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not choose your media. Your draft is still here.",
        );
    } finally {
      locked.current = false;
      if (mounted.current) setStage("idle");
    }
  }

  function remove(id: string) {
    if (busy) return;
    setMedia((previous) => previous.filter((item) => item.id !== id));
    setViewer(false);
  }

  function move(direction: -1 | 1) {
    if (busy || !selected) return;
    const target = selectedIndex + direction;
    if (target < 0 || target >= media.length) return;
    setMedia((previous) => {
      const updated = [...previous];
      [updated[selectedIndex], updated[target]] = [
        updated[target],
        updated[selectedIndex],
      ];
      return updated;
    });
    setActiveId(selected.id);
  }

  async function publish() {
    if (locked.current || !chosenCircle || (!content.trim() && !media.length))
      return;
    locked.current = true;
    setStage("sharing");
    setError("");
    setUploadProgress(null);
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      const result = await actions.createPost({
        circleId: circle,
        content,
        media: media[0]?.uri,
        mediaType: media[0]?.type,
        mediaDurationMs: media[0]?.duration,
        mediaMimeType: media[0]?.mimeType,
        attachments: media.length
          ? media.map((item) => ({
              uri: item.uri,
              type: item.type,
              width: item.width,
              height: item.height,
              durationMs: item.duration,
              mimeType: item.mimeType,
            }))
          : undefined,
        onUploadProgress: (progress) => {
          if (mounted.current) setUploadProgress(progress);
        },
        uploadSignal: controller.signal,
      });
      if (!mounted.current) return;
      if (result.ok) router.replace(("/post/" + result.id) as never);
      else
        setError(
          result.error ||
            "Could not share your moment. Your draft is still here.",
        );
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not share your moment. Your draft is still here.",
        );
    } finally {
      uploadController.current = null;
      locked.current = false;
      if (mounted.current) setStage("idle");
    }
  }

  if (!joinedCircles.length)
    return (
      <Empty
        title="Find your people first"
        body="Join or create a Circle, then keep your first moment together."
      >
        <Button onPress={() => router.push("/circles")}>Explore Circles</Button>
      </Empty>
    );

  return (
    <View style={s.page}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={s.back}
      >
        <ArrowLeft size={16} color={c.muted} />
        <T style={s.backText}>Back to your Circle</T>
      </Pressable>
      <View style={s.pageHeading}>
        <View style={s.eyebrow}>
          <View style={s.rule} />
          <T style={s.eyebrowText}>A PAGE IN YOUR STORY</T>
        </View>
        <T style={[s.title, compact && { fontSize: 31 }]}>Keep this moment.</T>
        <T style={s.subtitle}>
          The big days. The ordinary ones. The things you’ll want to remember.
        </T>
      </View>
      {!!error && <Banner text={error} onDismiss={() => setError("")} />}
      <Card style={[s.paper, compact && { borderRadius: 16 }]}>
        <View style={[s.top, compact && { padding: 18 }]}>
          <View style={s.author}>
            <Avatar name={user?.name || "You"} uri={user?.avatar} size={42} />
            <View style={{ flex: 1, gap: 4 }}>
              <T style={{ fontFamily: font.bold, fontSize: 14 }}>
                {user?.name || "You"}
              </T>
              <T style={{ color: c.muted, fontSize: 12 }}>
                A moment for your people
              </T>
            </View>
            <View style={s.privateBadge}>
              <LockKeyhole size={11} color={c.teal} />
              <T style={s.privateText}>PRIVATE</T>
            </View>
          </View>
          <T style={s.label}>SHARE WITH</T>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.circles}
          >
            {joinedCircles.map((item) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  selected: circle === item.id,
                  disabled: busy,
                }}
                disabled={busy}
                key={item.id}
                onPress={() => setCircle(item.id)}
                style={[s.circle, circle === item.id && s.circleSelected]}
              >
                <CircleAvatar
                  avatar={item.avatar}
                  color="transparent"
                  size={22}
                />
                <T
                  style={{
                    fontSize: 12,
                    fontFamily: circle === item.id ? font.bold : font.medium,
                  }}
                >
                  {item.name}
                </T>
                {circle === item.id && <Check size={13} color={c.teal} />}
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={[s.mediaSection, compact && { marginHorizontal: 12 }]}>
          {selected ? (
            <View style={s.preview}>
              <View
                style={s.mediaFrame}
                onLayout={(event) =>
                  setPreviewWidth(event.nativeEvent.layout.width)
                }
              >
                {selected.type === "video" ? (
                  <Video
                    uri={selected.uri}
                    label="Selected video preview"
                    height={previewHeight}
                  />
                ) : (
                  <MediaImage
                    key={selected.id}
                    uri={selected.uri}
                    label="Selected photo preview"
                    dimensions={selected}
                    style={{ height: previewHeight, aspectRatio: undefined }}
                    onPress={() => setViewer(true)}
                  />
                )}
                {media.length > 1 && (
                  <View style={s.countBadge}>
                    <Layers size={12} color="white" />
                    <T style={s.countText}>
                      {selectedIndex + 1} / {media.length}
                    </T>
                  </View>
                )}
                {!busy && (
                  <IconButton
                    icon={X}
                    label="Remove media"
                    onPress={() => remove(selected.id)}
                    style={s.remove}
                  />
                )}
              </View>
              <View style={s.previewFooter}>
                <View style={{ flex: 1, gap: 5 }}>
                  <T style={{ fontFamily: font.bold, fontSize: 12 }}>
                    {hasVideo
                      ? "A little motion, saved."
                      : media.length > 1
                        ? `${media.length} photos, one memory`
                        : "The whole picture."}
                  </T>
                  <T style={{ color: c.muted, fontSize: 10, lineHeight: 16 }}>
                    {hasVideo
                      ? `${formatDuration(selected.duration || 0)}${selected.bytes ? ` · ${formatBytes(selected.bytes)}` : ""} · Sound starts muted`
                      : `${selected.width} × ${selected.height} · Full photo, no crop`}
                  </T>
                </View>
                {selected.type === "image" && (
                  <IconButton
                    icon={Expand}
                    label="Preview photo full screen"
                    onPress={() => setViewer(true)}
                    size={17}
                  />
                )}
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add photos to your moment"
              disabled={busy}
              onPress={() => pick("images")}
              style={s.emptyMedia}
            >
              <View style={s.photoIcon}>
                <ImageIcon size={29} color={c.teal} strokeWidth={1.3} />
                <View style={s.plusMark}>
                  <Plus size={12} color="white" />
                </View>
              </View>
              <T style={s.emptyTitle}>Start with a photo. Or a few.</T>
              <T style={s.emptyBody}>
                Collect up to {MAX_POST_PHOTOS} photos in one moment, or share a
                video.
              </T>
              <View style={s.emptyLinkRow}>
                <T style={s.emptyLink}>Choose something worth keeping</T>
                <ArrowRight size={11} color={c.teal} />
              </View>
            </Pressable>
          )}

          {media.length > 1 && (
            <View style={s.albumTools}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.contactSheet}
              >
                {media.map((item, index) => (
                  <View key={item.id} style={s.thumbnailItem}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Select photo ${index + 1}`}
                      accessibilityState={{
                        selected: selected?.id === item.id,
                      }}
                      onPress={() => setActiveId(item.id)}
                      style={[
                        s.thumbnail,
                        selected?.id === item.id && s.thumbnailSelected,
                      ]}
                    >
                      <Image
                        source={{ uri: item.uri }}
                        accessibilityLabel={`Photo ${index + 1} thumbnail`}
                        style={s.thumbnailImage}
                        resizeMode="cover"
                      />
                      <View style={s.thumbnailNumber}>
                        <T
                          style={{
                            fontSize: 9,
                            fontFamily: font.bold,
                            color: "white",
                          }}
                        >
                          {index + 1}
                        </T>
                      </View>
                    </Pressable>
                    <T
                      style={[
                        s.thumbnailCaption,
                        index === 0 && { color: c.teal, fontFamily: font.bold },
                      ]}
                    >
                      {index === 0 ? "Cover" : `${index + 1}`}
                    </T>
                  </View>
                ))}
                {media.length < MAX_POST_PHOTOS && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add more photos"
                    disabled={busy}
                    onPress={() => pick("images")}
                    style={s.addThumbnail}
                  >
                    <Plus size={22} color={c.teal} />
                    <T style={{ fontSize: 10, color: c.teal }}>Add more</T>
                  </Pressable>
                )}
              </ScrollView>
              <View style={s.orderRow}>
                <T style={s.orderHint}>
                  Photo {selectedIndex + 1} of {media.length}
                  {selectedIndex === 0 ? " · Cover photo" : ""}
                </T>
                <View style={{ flexDirection: "row", gap: 5 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Move photo earlier"
                    disabled={busy || selectedIndex === 0}
                    onPress={() => move(-1)}
                    style={[
                      s.orderButton,
                      (busy || selectedIndex === 0) && { opacity: 0.3 },
                    ]}
                  >
                    <ArrowLeft size={15} color={c.ink} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Move photo later"
                    disabled={busy || selectedIndex === media.length - 1}
                    onPress={() => move(1)}
                    style={[
                      s.orderButton,
                      (busy || selectedIndex === media.length - 1) && {
                        opacity: 0.3,
                      },
                    ]}
                  >
                    <ArrowRight size={15} color={c.ink} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${selectedIndex + 1}`}
                    disabled={busy}
                    onPress={() => selected && remove(selected.id)}
                    style={s.orderButton}
                  >
                    <X size={15} color={c.muted} />
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>

        {stage === "preparing" && (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Preparing your media"
            style={[s.progress, compact && { marginHorizontal: 18 }]}
          >
            <ActivityIndicator size="small" color={c.teal} />
            <View style={{ flex: 1, gap: 4 }}>
              <T style={{ fontFamily: font.bold, fontSize: 12 }}>
                {preparing.total > 1
                  ? `Preparing photo ${preparing.current} of ${preparing.total}…`
                  : "Preparing your moment…"}
              </T>
              <T style={{ color: c.muted, fontSize: 11 }}>
                Keeping the details worth remembering.
              </T>
            </View>
          </View>
        )}

        <View style={[s.captionSection, compact && { paddingHorizontal: 18 }]}>
          <View style={s.captionHeading}>
            <T style={s.label}>THE WORDS UNDERNEATH</T>
            <T style={{ fontSize: 10, color: c.muted }}>
              {content.length.toLocaleString()} / 5,000
            </T>
          </View>
          <Field
            accessibilityLabel="Post content"
            placeholder="What’s the story behind this moment?"
            value={content}
            onChangeText={setContent}
            editable={!busy}
            multiline
            maxLength={5000}
            style={s.caption}
          />
          <View style={s.attachments}>
            <Button
              secondary
              icon={ImageIcon}
              disabled={busy || hasVideo || media.length >= MAX_POST_PHOTOS}
              onPress={() => pick("images")}
            >
              Photo
            </Button>
            <Button
              secondary
              icon={VideoIcon}
              disabled={busy || media.length > 0}
              onPress={() => pick("videos")}
            >
              Video
            </Button>
            <T style={s.attachmentHint}>
              {hasVideo
                ? "One video, one moment"
                : media.length
                  ? `${media.length} of ${MAX_POST_PHOTOS} photos`
                  : "A thought on its own is welcome, too."}
            </T>
          </View>
          {!!media.length && (
            <T style={s.mediaNote}>
              {hasVideo
                ? "Videos up to 10 minutes · 250 MB. Original video metadata may remain in the file."
                : `Photos up to 200 MB each. The first photo is your album’s cover.`}
            </T>
          )}
        </View>

        <View
          style={[
            s.publish,
            compact && {
              paddingHorizontal: 18,
              flexDirection: "column",
              alignItems: "stretch",
            },
          ]}
        >
          <View style={s.audienceNote}>
            <LockKeyhole size={13} color={c.muted} />
            <T style={s.audienceText}>
              {mode === "demo"
                ? "Saved on this device only."
                : `Just ${chosenCircle?.name || "your Circle"}. A shared memory for your people.`}
            </T>
          </View>
          <Button
            icon={Send}
            disabled={
              busy || (!content.trim() && !media.length) || !chosenCircle
            }
            onPress={publish}
            style={{ minHeight: 46 }}
          >
            {stage === "sharing"
              ? mode === "demo"
                ? "Saving…"
                : "Sharing…"
              : stage === "preparing" || stage === "choosing"
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
                : `Uploading your media: ${Math.round(overallProgress * 100)} percent`
            }
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(overallProgress * 100),
            }}
            style={[s.sharingProgress, compact && { paddingHorizontal: 18 }]}
          >
            <View style={s.progressTrack}>
              <View
                style={[
                  s.progressFill,
                  { width: `${Math.round(overallProgress * 100)}%` },
                ]}
              />
            </View>
            <View style={s.progressRow}>
              <ActivityIndicator size="small" color={c.teal} />
              <T style={s.uploadText}>
                {mode === "demo"
                  ? "Saving your moment on this device…"
                  : media.length
                    ? uploadProgress
                      ? progressFraction === 1 && itemIndex === itemCount
                        ? "Upload complete. Sharing with your Circle…"
                        : `${itemCount > 1 ? `Photo ${itemIndex} of ${itemCount} · ` : ""}${formatBytes(uploadProgress.uploaded)} of ${formatBytes(uploadProgress.total)}`
                      : "Preparing your upload…"
                    : "Sharing with your Circle…"}
              </T>
              {mode !== "demo" && !!media.length && overallProgress < 1 && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => uploadController.current?.abort()}
                  style={s.cancelUpload}
                >
                  <T
                    style={{
                      fontSize: 12,
                      fontFamily: font.bold,
                      color: c.teal,
                    }}
                  >
                    Cancel upload
                  </T>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </Card>
      <T style={s.footnote}>Some things are better kept together.</T>
      {selected && (
        <MediaViewer
          visible={viewer}
          onClose={() => setViewer(false)}
          uri={selected.uri}
          type={selected.type}
          caption={content || "Your moment, ready to share."}
          author={user?.name}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: { width: "100%", maxWidth: 760, alignSelf: "center" },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 25,
    alignSelf: "flex-start",
    minHeight: 28,
  },
  backText: { color: c.muted, fontSize: 12 },
  pageHeading: { marginBottom: 27 },
  eyebrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 13,
  },
  rule: { width: 22, height: 1, backgroundColor: "#B3BCAF" },
  eyebrowText: {
    fontSize: 9,
    letterSpacing: 1.7,
    color: "#7A8878",
    fontFamily: font.bold,
  },
  title: {
    fontFamily: font.editorial,
    fontSize: 38,
    letterSpacing: -1.5,
    color: c.ink,
  },
  subtitle: {
    color: c.muted,
    fontSize: 13,
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 480,
  },
  paper: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E8E0",
    borderRadius: 20,
    overflow: "hidden",
  },
  top: { padding: 24, paddingBottom: 20 },
  author: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 23,
  },
  privateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EFF4EC",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  privateText: {
    color: c.teal,
    fontSize: 8,
    letterSpacing: 1,
    fontFamily: font.bold,
  },
  label: {
    fontSize: 9,
    letterSpacing: 1.3,
    color: "#7C887F",
    fontFamily: font.bold,
  },
  circles: { flexDirection: "row", gap: 8, paddingTop: 10, paddingBottom: 2 },
  circle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E9EBE5",
    backgroundColor: "#FAFAF7",
  },
  circleSelected: { borderColor: "#AEC3AE", backgroundColor: "#EFF4EC" },
  mediaSection: { marginHorizontal: 16 },
  emptyMedia: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D8E0D4",
    backgroundColor: "#F8F9F4",
    minHeight: 240,
  },
  photoIcon: {
    width: 63,
    height: 61,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EDF2E7",
    borderRadius: 17,
    marginBottom: 19,
  },
  plusMark: {
    position: "absolute",
    bottom: 4,
    right: 3,
    backgroundColor: c.teal,
    padding: 3,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#F8F9F4",
  },
  emptyTitle: {
    fontFamily: font.heading,
    fontSize: 18,
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyBody: {
    color: c.muted,
    fontSize: 12,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 270,
  },
  emptyLink: {
    color: c.teal,
    fontFamily: font.bold,
    fontSize: 11,
    textAlign: "center",
  },
  emptyLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
  },
  preview: {
    borderWidth: 1,
    borderColor: "#E8EBE3",
    borderRadius: 12,
    overflow: "hidden",
  },
  mediaFrame: { position: "relative", backgroundColor: "#F2F3EF" },
  remove: {
    position: "absolute",
    right: 10,
    top: 10,
    backgroundColor: "#FFFFFFEF",
    borderRadius: 20,
  },
  countBadge: {
    position: "absolute",
    left: 12,
    top: 12,
    backgroundColor: "#1C3027CC",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  countText: { color: "white", fontSize: 10, fontFamily: font.bold },
  previewFooter: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 13,
    backgroundColor: "#FCFCF9",
  },
  albumTools: { paddingTop: 13 },
  contactSheet: { gap: 9, paddingVertical: 2 },
  thumbnailItem: { alignItems: "center", gap: 5 },
  thumbnail: {
    width: 66,
    height: 66,
    borderRadius: 9,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  thumbnailSelected: { borderColor: c.teal },
  thumbnailImage: { width: "100%", height: "100%" },
  thumbnailNumber: {
    position: "absolute",
    top: 3,
    left: 3,
    backgroundColor: "#233B31AD",
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
  },
  thumbnailCaption: { fontSize: 9, color: c.muted },
  addThumbnail: {
    width: 66,
    height: 66,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#CAD8C8",
    backgroundColor: "#F4F7F0",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  orderRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  orderHint: { fontSize: 10, color: c.muted, flexShrink: 1 },
  orderButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E7EBE2",
    borderRadius: 8,
    backgroundColor: "#FCFCF9",
  },
  captionSection: { paddingTop: 25, paddingHorizontal: 24, paddingBottom: 21 },
  captionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 11,
  },
  caption: {
    minHeight: 118,
    borderColor: "#E4E8DF",
    backgroundColor: "#FCFCF9",
    borderRadius: 11,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 14,
    lineHeight: 23,
  },
  attachments: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 9,
  },
  attachmentHint: {
    flex: 1,
    minWidth: 130,
    fontSize: 11,
    color: c.muted,
    lineHeight: 18,
    marginLeft: 3,
  },
  mediaNote: { fontSize: 10, color: c.muted, lineHeight: 17, marginTop: 13 },
  publish: {
    padding: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderColor: "#EBEDE6",
    backgroundColor: "#FDFCFA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 17,
  },
  audienceNote: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  audienceText: { color: c.muted, fontSize: 11, lineHeight: 18, flex: 1 },
  progress: {
    marginHorizontal: 24,
    marginTop: 16,
    padding: 15,
    backgroundColor: "#F0F5EA",
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sharingProgress: {
    paddingHorizontal: 24,
    paddingBottom: 22,
    backgroundColor: "#FDFCFA",
  },
  progressTrack: {
    height: 4,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "#E6ECE1",
    marginBottom: 12,
  },
  progressFill: { height: "100%", backgroundColor: c.teal, borderRadius: 3 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  uploadText: { fontSize: 11, color: c.muted, flex: 1, lineHeight: 18 },
  cancelUpload: { padding: 5 },
  footnote: {
    marginTop: 22,
    fontSize: 11,
    color: "#8B9589",
    textAlign: "center",
    marginBottom: 15,
  },
});
