import React, { useMemo, useRef, useState } from "react";
import {
  Image,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from "react-native";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Minus,
  Plus,
  RotateCcw,
  type LucideIcon,
} from "lucide-react-native";
import {
  coverCropRect,
  DEFAULT_COVER_TRANSFORM,
  MAX_COVER_ZOOM,
  moveCoverCrop,
  normalizeCoverTransform,
  type CoverImageSize,
  type CoverTransform,
} from "../lib/coverCrop";
import { useCircleTheme, themeTint } from "../features/theme-context";
import { T } from "./primitives";
import { font } from "./theme";

function pinchDistance(event: GestureResponderEvent) {
  const touches = event.nativeEvent.touches;
  return touches?.length >= 2
    ? Math.hypot(
        touches[0].pageX - touches[1].pageX,
        touches[0].pageY - touches[1].pageY,
      )
    : 0;
}

function Control({
  label,
  icon: Icon,
  onPress,
  disabled,
  inactive = false,
}: {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  disabled: boolean;
  inactive?: boolean;
}) {
  const theme = useCircleTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || inactive }}
      disabled={disabled || inactive}
      onPress={onPress}
      style={({ pressed }) => [
        s.control,
        { backgroundColor: themeTint(theme.accent, 0.08) },
        (disabled || inactive) && { opacity: 0.4 },
        pressed && { opacity: 0.65 },
      ]}
    >
      <Icon size={18} color={theme.accent} />
    </Pressable>
  );
}

export function CoverCropper({
  uri,
  image,
  aspect,
  transform,
  disabled = false,
  onChange,
  onLoad,
  onError,
}: {
  uri: string;
  image: CoverImageSize;
  aspect: number;
  transform: CoverTransform;
  disabled?: boolean;
  onChange: (value: CoverTransform) => void;
  onLoad: () => void;
  onError: () => void;
}) {
  const theme = useCircleTheme();
  const [frameWidth, setFrameWidth] = useState(1);
  const latest = useRef({
    image,
    aspect,
    transform,
    disabled,
    onChange,
    frameWidth,
  });
  latest.current = { image, aspect, transform, disabled, onChange, frameWidth };
  const gesture = useRef({
    start: transform,
    startX: 0,
    startY: 0,
    pinch: 0,
  });
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !latest.current.disabled,
        onMoveShouldSetPanResponder: () => !latest.current.disabled,
        onPanResponderGrant: (event, state) => {
          gesture.current = {
            start: latest.current.transform,
            startX: state.dx,
            startY: state.dy,
            pinch: pinchDistance(event),
          };
        },
        onPanResponderMove: (event, state) => {
          const current = latest.current;
          if (current.disabled || current.frameWidth <= 1) return;
          const distance = pinchDistance(event);
          if (distance > 0) {
            if (!gesture.current.pinch)
              gesture.current = {
                start: current.transform,
                startX: state.dx,
                startY: state.dy,
                pinch: distance,
              };
            current.onChange(
              normalizeCoverTransform(current.image, current.aspect, {
                ...gesture.current.start,
                zoom:
                  (gesture.current.start.zoom * distance) /
                  gesture.current.pinch,
              }),
            );
          } else {
            if (gesture.current.pinch)
              gesture.current = {
                start: current.transform,
                startX: state.dx,
                startY: state.dy,
                pinch: 0,
              };
            current.onChange(
              moveCoverCrop(
                current.image,
                current.aspect,
                gesture.current.start,
                (state.dx - gesture.current.startX) / current.frameWidth,
                (state.dy - gesture.current.startY) /
                  (current.frameWidth / current.aspect),
              ),
            );
          }
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );
  const value = normalizeCoverTransform(image, aspect, transform);
  const rect = coverCropRect(image, aspect, value);
  const frameHeight = frameWidth / aspect;
  const move = (x: number, y: number) =>
    onChange(moveCoverCrop(image, aspect, value, x, y));
  const zoom = (amount: number) =>
    onChange(
      normalizeCoverTransform(image, aspect, {
        ...value,
        zoom: value.zoom + amount,
      }),
    );

  return (
    <View style={{ gap: 14 }}>
      <View
        testID="circle-cover-cropper"
        accessibilityLabel="Circle photo crop preview. Drag the photo to reposition it."
        onLayout={(event) =>
          setFrameWidth(Math.max(1, event.nativeEvent.layout.width))
        }
        style={[
          s.frame,
          { aspectRatio: aspect },
          Platform.OS === "web" &&
            ({ touchAction: "none", userSelect: "none" } as never),
        ]}
        {...responder.panHandlers}
      >
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image
            testID="circle-cover-preview"
            accessibilityLabel="Circle photo preview"
            source={{ uri }}
            resizeMode="stretch"
            onLoad={onLoad}
            onError={onError}
            style={{
              position: "absolute",
              width: (image.width * frameWidth) / rect.width,
              height: (image.height * frameHeight) / rect.height,
              left: (-rect.originX * frameWidth) / rect.width,
              top: (-rect.originY * frameHeight) / rect.height,
            }}
          />
          <View style={s.border} />
          {[1, 2].map((line) => (
            <React.Fragment key={line}>
              <View
                style={[
                  s.vertical,
                  { left: line === 1 ? "33.333%" : "66.666%" },
                ]}
              />
              <View
                style={[
                  s.horizontal,
                  { top: line === 1 ? "33.333%" : "66.666%" },
                ]}
              />
            </React.Fragment>
          ))}
        </View>
      </View>
      <T style={{ fontSize: 12, color: theme.ink, lineHeight: 19 }}>
        Drag to reposition. Pinch or use the zoom buttons to choose the part you
        want.
      </T>
      <View style={s.toolbar}>
        <View style={s.group}>
          <Control
            disabled={disabled}
            label="Zoom out"
            icon={Minus}
            onPress={() => zoom(-0.15)}
            inactive={value.zoom <= 1}
          />
          <T
            style={{
              fontFamily: font.bold,
              fontSize: 12,
              minWidth: 42,
              textAlign: "center",
            }}
          >
            {Math.round(value.zoom * 100)}%
          </T>
          <Control
            disabled={disabled}
            label="Zoom in"
            icon={Plus}
            onPress={() => zoom(0.15)}
            inactive={value.zoom >= MAX_COVER_ZOOM}
          />
          <Control
            disabled={disabled}
            label="Reset crop"
            icon={RotateCcw}
            onPress={() => onChange({ ...DEFAULT_COVER_TRANSFORM })}
          />
        </View>
        <View style={s.group}>
          <Control
            disabled={disabled}
            label="Move photo left"
            icon={ArrowLeft}
            onPress={() => move(-0.1, 0)}
          />
          <Control
            disabled={disabled}
            label="Move photo right"
            icon={ArrowRight}
            onPress={() => move(0.1, 0)}
          />
          <Control
            disabled={disabled}
            label="Move photo up"
            icon={ArrowUp}
            onPress={() => move(0, -0.1)}
          />
          <Control
            disabled={disabled}
            label="Move photo down"
            icon={ArrowDown}
            onPress={() => move(0, 0.1)}
          />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  frame: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: "#FFFFFF99",
    borderRadius: 16,
  },
  vertical: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#FFFFFF77",
  },
  horizontal: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#FFFFFF77",
  },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  group: { flexDirection: "row", alignItems: "center", gap: 5 },
  control: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
