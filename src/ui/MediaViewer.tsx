import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoView, useVideoPlayer } from "expo-video";
import { Expand, ImageOff, RotateCcw, X } from "lucide-react-native";
import { mediaFrameRatio } from "../lib/media";
import { T } from "./primitives";
import { colors as c, font } from "./theme";

export function MediaImage({
  uri,
  label,
  fullScreen = false,
  onPress,
  dimensions,
  style,
}: {
  uri: string;
  label: string;
  fullScreen?: boolean;
  onPress?: () => void;
  dimensions?: { width: number; height: number };
  style?: StyleProp<ViewStyle>;
}) {
  const [ratio, setRatio] = useState(
    mediaFrameRatio(dimensions?.width, dimensions?.height),
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus("loading");
    // React Native Web's load event does not consistently include source
    // dimensions. Resolve the natural dimensions through the shared Image API.
    Image.getSize(
      uri,
      (width, height) => {
        if (active) setRatio(mediaFrameRatio(width, height));
      },
      () => {
        /* The displayed Image handles its own error and retry UI. */
      },
    );
    return () => {
      active = false;
    };
  }, [uri, attempt]);
  const frame = fullScreen ? { flex: 1 as const } : { aspectRatio: ratio };
  const retry = () => {
    setStatus("loading");
    setAttempt((x) => x + 1);
  };
  const content = (
    <>
      <Image
        key={`${uri}:${attempt}`}
        source={{ uri }}
        accessibilityLabel={label}
        resizeMode="contain"
        style={[
          StyleSheet.absoluteFillObject,
          { opacity: status === "ready" ? 1 : 0 },
        ]}
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("error")}
      />
      {status === "loading" && (
        <View pointerEvents="none" style={styles.center}>
          <ActivityIndicator color={fullScreen ? "#D7E7DD" : c.teal} />
          <T style={[styles.loadingText, fullScreen && { color: "#B5C7BC" }]}>
            Loading photo…
          </T>
        </View>
      )}
      {status === "error" && (
        <View style={styles.center}>
          <ImageOff size={25} color={fullScreen ? "#ADBBB4" : c.muted} />
          <T style={[styles.errorText, fullScreen && { color: "#D6E2DB" }]}>
            This photo couldn’t load.
          </T>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry photo"
            onPress={retry}
            style={styles.retry}
          >
            <RotateCcw size={13} color={fullScreen ? "#D6E2DB" : c.teal} />
            <T
              style={{
                fontSize: 12,
                color: fullScreen ? "#D6E2DB" : c.teal,
                fontFamily: font.bold,
              }}
            >
              Try again
            </T>
          </Pressable>
        </View>
      )}
      {!fullScreen && onPress && status === "ready" && (
        <View pointerEvents="none" style={styles.expand}>
          <Expand size={14} color="white" />
        </View>
      )}
    </>
  );
  return onPress && status !== "error" ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open photo full screen"
      onPress={onPress}
      style={[styles.imageFrame, frame, style]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={[styles.imageFrame, frame, style]}>{content}</View>
  );
}

/** No autoplay, no looping, and native playback, scrubbing, volume and full-screen controls. */
export function Video({
  uri,
  height = 340,
  label = "Circle video",
  style,
}: {
  uri: string;
  height?: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = false;
  });
  const [status, setStatus] = useState(player.status);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    const listener = player.addListener("statusChange", (event) => {
      setStatus(event.status);
      setRetrying(false);
    });
    return () => {
      listener.remove();
    };
  }, [player]);
  const retry = async () => {
    setRetrying(true);
    try {
      await player.replaceAsync(uri);
    } catch {
      setRetrying(false);
    }
  };
  return (
    <View
      style={[
        {
          width: "100%",
          height,
          backgroundColor: "#10231D",
          overflow: "hidden",
        },
        style,
      ]}
    >
      <VideoView
        accessibilityLabel={label}
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit="contain"
        nativeControls
        allowsFullscreen
        allowsPictureInPicture={false}
      />
      {(status === "idle" || status === "loading" || retrying) && (
        <View
          pointerEvents="none"
          style={[styles.center, { backgroundColor: "#10231D" }]}
        >
          <ActivityIndicator color="#D7E7DD" />
          <T style={[styles.loadingText, { color: "#B5C7BC" }]}>
            Loading video…
          </T>
        </View>
      )}
      {status === "error" && !retrying && (
        <View style={[styles.center, { backgroundColor: "#10231D" }]}>
          <T style={[styles.errorText, { color: "#D6E2DB" }]}>
            This video couldn’t load.
          </T>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry video"
            onPress={retry}
            style={styles.retry}
          >
            <RotateCcw size={14} color="#D6E2DB" />
            <T
              style={{ color: "#D6E2DB", fontSize: 12, fontFamily: font.bold }}
            >
              Try again
            </T>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function MediaViewer({
  visible,
  onClose,
  uri,
  type = "image",
  caption = "",
  author = "",
}: {
  visible: boolean;
  onClose: () => void;
  uri: string;
  type?: "image" | "video";
  caption?: string;
  author?: string;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [visible, onClose]);
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <View
        accessibilityViewIsModal
        style={[
          styles.viewer,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.viewerHeader}>
          <View style={{ flex: 1 }}>
            <T style={{ color: "white", fontFamily: font.bold, fontSize: 14 }}>
              {author || "A moment from your Circle"}
            </T>
            <T style={{ color: "#96ADA0", fontSize: 10, marginTop: 5 }}>
              Only in this Circle
            </T>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close media viewer"
            onPress={onClose}
            hitSlop={10}
            style={styles.close}
          >
            <X size={23} color="white" />
          </Pressable>
        </View>
        {visible &&
          (type === "video" ? (
            <Video
              uri={uri}
              label={caption || "Circle video"}
              height={Math.max(240, height - 210 - insets.top - insets.bottom)}
              style={{ flex: 1 }}
            />
          ) : Platform.OS === "ios" ? (
            <ScrollView
              contentContainerStyle={{ flexGrow: 1 }}
              style={{ flex: 1 }}
              minimumZoomScale={1}
              maximumZoomScale={3}
              centerContent
            >
              <MediaImage
                uri={uri}
                label={caption || "Circle photo"}
                fullScreen
                style={{
                  minHeight: height - 240 - insets.top - insets.bottom,
                  backgroundColor: "#10231D",
                }}
              />
            </ScrollView>
          ) : (
            <MediaImage
              uri={uri}
              label={caption || "Circle photo"}
              fullScreen
              style={{ backgroundColor: "#10231D" }}
            />
          ))}
        <View style={styles.viewerFooter}>
          <T
            numberOfLines={3}
            style={{ color: "#E5EDE7", fontSize: 13, lineHeight: 21 }}
          >
            {caption}
          </T>
          {Platform.OS === "ios" && type === "image" && (
            <T style={{ fontSize: 10, color: "#94ACA0", marginTop: 10 }}>
              Pinch to see the little details
            </T>
          )}
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  imageFrame: {
    width: "100%",
    backgroundColor: "#EDF2ED",
    overflow: "hidden",
    minHeight: 150,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
    padding: 25,
  },
  loadingText: { fontSize: 11, color: c.muted },
  errorText: { fontSize: 13, color: c.muted, textAlign: "center" },
  retry: {
    padding: 12,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    borderRadius: 10,
  },
  expand: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#17372B90",
    borderRadius: 10,
  },
  viewer: { flex: 1, backgroundColor: "#10231D" },
  viewerHeader: {
    paddingHorizontal: 22,
    paddingVertical: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  close: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF13",
    borderRadius: 23,
  },
  viewerFooter: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 24,
    minHeight: 70,
  },
});
