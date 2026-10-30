import React, { useEffect, useRef, useState } from "react";
import {
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { getPostMedia } from "../lib/postMedia";
import { mediaFrameRatio } from "../lib/media";
import type { Post } from "../types";
import { MediaImage, MediaViewer, Video } from "./MediaViewer";
import { T } from "./primitives";
import { colors as c, font } from "./theme";

/** One shared photo album keeps the feed, detail, and full-screen order alike. */
export function PostGallery({ post, author }: { post: Post; author?: string }) {
  const media = getPostMedia(post);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const scroller = useRef<ScrollView>(null);
  const count = media.length;
  const active = Math.min(index, Math.max(0, count - 1));
  const activePage = useRef(active);
  activePage.current = active;
  useEffect(() => {
    if (width)
      scroller.current?.scrollTo({
        x: activePage.current * width,
        animated: false,
      });
  }, [width]);
  if (!count) return null;
  const first = media[0];
  const frameHeight = width
    ? Math.min(
        660,
        width / (count > 1 ? 1.12 : mediaFrameRatio(first.width, first.height)),
      )
    : 330;
  const goTo = (next: number) => {
    const page = Math.max(0, Math.min(count - 1, next));
    setIndex(page);
    // Explicit navigation lands on an exact page immediately. Smooth scroll
    // events can otherwise override a second dot/arrow click mid-animation.
    scroller.current?.scrollTo({ x: page * width, animated: false });
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const next = Math.max(
      0,
      Math.min(
        count - 1,
        Math.round(event.nativeEvent.contentOffset.x / width),
      ),
    );
    if (next !== active) setIndex(next);
  };
  return (
    <View style={s.album}>
      <View
        style={s.mount}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {first.type === "video" ? (
          <Video
            uri={first.uri}
            label={post.content || "Circle video"}
            height={frameHeight}
          />
        ) : count === 1 ? (
          <MediaImage
            uri={first.uri}
            label={post.content || "Circle photo"}
            style={{ maxHeight: 660 }}
            dimensions={
              first.width && first.height
                ? { width: first.width, height: first.height }
                : undefined
            }
            onPress={() => setViewerIndex(0)}
          />
        ) : (
          <>
            <ScrollView
              ref={scroller}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={32}
              onMomentumScrollEnd={onScroll}
              style={{ height: frameHeight }}
              accessibilityLabel={`${count} photos in this moment`}
            >
              {media.map((item, page) => (
                <View
                  key={page}
                  style={{ width, height: frameHeight }}
                  accessibilityElementsHidden={page !== active}
                  aria-hidden={page !== active}
                  importantForAccessibility={
                    page === active ? "auto" : "no-hide-descendants"
                  }
                >
                  {Math.abs(page - active) <= 1 && (
                    <MediaImage
                      uri={item.uri}
                      label={`${post.content || "Circle photo"} · Photo ${page + 1} of ${count}`}
                      onPress={
                        page === active ? () => setViewerIndex(page) : undefined
                      }
                      style={{ height: frameHeight, aspectRatio: undefined }}
                    />
                  )}
                </View>
              ))}
            </ScrollView>
            <View pointerEvents="none" style={s.counter}>
              <T style={s.counterText}>
                {active + 1} / {count}
              </T>
            </View>
            {active > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous photo"
                onPress={() => goTo(active - 1)}
                style={[s.arrow, { left: 12 }]}
              >
                <ChevronLeft size={18} color={c.ink} />
              </Pressable>
            )}
            {active < count - 1 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next photo"
                onPress={() => goTo(active + 1)}
                style={[s.arrow, { right: 12 }]}
              >
                <ChevronRight size={18} color={c.ink} />
              </Pressable>
            )}
          </>
        )}
      </View>
      {count > 1 && (
        <View style={s.pagination}>
          {media.map((_, page) => (
            <Pressable
              key={page}
              accessibilityRole="button"
              accessibilityLabel={`Go to photo ${page + 1} of ${count}`}
              accessibilityState={{ selected: page === active }}
              {...(Platform.OS === "web"
                ? { "aria-pressed": page === active }
                : {})}
              onPress={() => goTo(page)}
              style={s.dotTarget}
            >
              <View style={[s.dot, page === active && s.dotActive]} />
            </Pressable>
          ))}
        </View>
      )}
      <MediaViewer
        visible={viewerIndex !== null}
        onClose={() => setViewerIndex(null)}
        uri={first.uri}
        type={first.type}
        caption={post.content}
        author={author}
        items={media}
        initialIndex={viewerIndex || 0}
      />
    </View>
  );
}

const s = StyleSheet.create({
  album: { paddingHorizontal: 12 },
  mount: { borderRadius: 12, overflow: "hidden", backgroundColor: "#F1F1EB" },
  counter: {
    position: "absolute",
    top: 12,
    right: 12,
    borderRadius: 20,
    backgroundColor: "#20342AD9",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  counterText: { color: "white", fontSize: 11, fontFamily: font.bold },
  arrow: {
    position: "absolute",
    top: "46%",
    width: 34,
    height: 34,
    borderRadius: 18,
    backgroundColor: "#FFFFFFED",
    borderWidth: 1,
    borderColor: "#FFFFFF90",
    alignItems: "center",
    justifyContent: "center",
  },
  pagination: { flexDirection: "row", justifyContent: "center", paddingTop: 8 },
  dotTarget: {
    padding: 7,
    minWidth: 20,
    minHeight: 24,
    justifyContent: "center",
  },
  dot: { width: 5, height: 5, borderRadius: 4, backgroundColor: "#D1D9D0" },
  dotActive: { backgroundColor: c.teal, width: 14 },
});
