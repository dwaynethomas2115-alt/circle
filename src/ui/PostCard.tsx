import React, { useState } from "react";
import { View, Pressable, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import {
  Heart,
  MessageCircle,
  MoreHorizontal,
  LockKeyhole,
  ArrowUpRight,
  Flag,
  Trash2,
  UserRoundX,
} from "lucide-react-native";
import { useCircle } from "../state/CircleProvider";
import type { Post } from "../types";
import {
  T,
  Avatar,
  Card,
  IconButton,
  Banner,
  CircleAvatar,
} from "./primitives";
import { colors as c, font } from "./theme";
import { VideoView, useVideoPlayer } from "expo-video";
export function timeAgo(date: string) {
  const mins = Math.max(
    1,
    Math.floor((Date.now() - new Date(date).getTime()) / 60000),
  );
  return mins < 60
    ? `${mins}m ago`
    : mins < 1440
      ? `${Math.floor(mins / 60)}h ago`
      : `${Math.floor(mins / 1440)}d ago`;
}
export function Video({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      player={player}
      style={{ width: "100%", height: 340 }}
      contentFit="contain"
      nativeControls
      allowsFullscreen
    />
  );
}
export function PostCard({
  post,
  detail = false,
}: {
  post: Post;
  detail?: boolean;
}) {
  const { state, user, actions } = useCircle();
  const router = useRouter();
  const [menu, setMenu] = useState(false),
    [notice, setNotice] = useState("");
  const author = state.users.find((u) => u.id === post.authorId);
  const circle = state.circles.find((x) => x.id === post.circleId);
  const comments = state.comments.filter((x) => x.postId === post.id);
  const liked = !!user && post.reactions.includes(user.id);
  const open = () => router.push(("/post/" + post.id) as never);
  async function action(kind: "delete" | "report" | "block") {
    setMenu(false);
    const result =
      kind === "delete"
        ? await actions.deletePost(post.id)
        : kind === "block"
          ? await actions.blockUser(post.authorId)
          : await actions.report(
              "post",
              post.id,
              "Member flagged this post for moderator review.",
            );
    setNotice(
      result.ok
        ? kind === "report"
          ? "Report sent for review."
          : kind === "block"
            ? "This person’s content is now hidden."
            : "Post deleted."
        : result.error || "Please try again.",
    );
  }
  return (
    <Card style={{ marginBottom: 20 }}>
      <View style={s.header}>
        <Avatar
          name={author?.name || "Circle member"}
          uri={author?.avatar}
          size={42}
        />
        <View style={{ flex: 1, gap: 5 }}>
          <T style={{ fontFamily: font.bold, fontSize: 13 }}>
            {author?.name || "Circle member"}{" "}
            <T style={{ color: "#A4ADA7", fontSize: 10 }}>
              {" "}
              · {timeAgo(post.createdAt)}
            </T>
          </T>
          <Pressable
            onPress={() => router.push(("/circle/" + post.circleId) as never)}
            style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
          >
            {circle && (
              <CircleAvatar
                avatar={circle.avatar}
                color="transparent"
                size={13}
              />
            )}
            <T style={{ fontSize: 11, color: "#7B8C80" }}>{circle?.name}</T>
            <LockKeyhole size={9} color="#97A59A" />
          </Pressable>
        </View>
        <IconButton
          icon={MoreHorizontal}
          label="Post options"
          onPress={() => setMenu(!menu)}
          color="#8D9C91"
        />
      </View>
      {menu && (
        <View style={s.menu}>
          {post.authorId === user?.id && (
            <Pressable onPress={() => action("delete")} style={s.menuItem}>
              <Trash2 size={14} color={c.red} />
              <T style={{ fontSize: 12, color: c.red }}>Delete post</T>
            </Pressable>
          )}
          <Pressable onPress={() => action("report")} style={s.menuItem}>
            <Flag size={14} color={c.ink} />
            <T style={{ fontSize: 12 }}>Report post</T>
          </Pressable>
          {post.authorId !== user?.id && (
            <Pressable onPress={() => action("block")} style={s.menuItem}>
              <UserRoundX size={14} color={c.ink} />
              <T style={{ fontSize: 12 }}>Block this person</T>
            </Pressable>
          )}
        </View>
      )}
      {!!notice && (
        <View style={{ paddingHorizontal: 20 }}>
          <Banner text={notice} onDismiss={() => setNotice("")} />
        </View>
      )}
      {post.media &&
        (post.mediaType === "video" ? (
          <Video uri={post.media} />
        ) : (
          <Pressable onPress={open} accessibilityLabel="View post and comments">
            <Image
              source={{ uri: post.media }}
              accessibilityLabel={post.content}
              style={{
                width: "100%",
                aspectRatio: 1.62,
                backgroundColor: "#E4EBE1",
              }}
              resizeMode="cover"
            />
          </Pressable>
        ))}
      <View
        style={{
          paddingHorizontal: 22,
          paddingTop: post.media ? 18 : 0,
          paddingBottom: 0,
          gap: 9,
        }}
      >
        {post.tag && (
          <T
            style={{
              fontSize: 8,
              letterSpacing: 1.65,
              color: c.teal,
              fontFamily: font.bold,
            }}
          >
            {post.tag}
          </T>
        )}
        <T style={{ fontSize: 13, lineHeight: 23, color: "#53665B" }}>
          {post.content}
        </T>
      </View>
      <View
        style={{ paddingHorizontal: 20, paddingTop: 15, paddingBottom: 17 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 17 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={liked ? "Remove reaction" : "Like post"}
            onPress={async () => {
              const r = await actions.toggleReaction(post.id);
              if (!r.ok) setNotice(r.error || "Please try again.");
            }}
            style={s.action}
          >
            <Heart
              size={20}
              color={liked ? "#CB8175" : "#7E8E82"}
              fill={liked ? "#CB8175" : "none"}
              strokeWidth={1.6}
            />
            <T style={{ color: "#75877B", fontSize: 12 }}>
              {post.reactions.length}
            </T>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View comments"
            onPress={open}
            style={s.action}
          >
            <MessageCircle size={19} color="#7E8E82" strokeWidth={1.6} />
            <T style={{ color: "#75877B", fontSize: 12 }}>{comments.length}</T>
          </Pressable>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <LockKeyhole size={10} color="#A3AFA5" />
            <T style={{ fontSize: 9, color: "#A0ADA3" }}>Only in this Circle</T>
          </View>
        </View>
        {post.reactions.length > 0 && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginTop: 13,
            }}
          >
            <View style={{ flexDirection: "row", paddingLeft: 4 }}>
              {post.reactions.slice(0, 3).map((id) => {
                const u = state.users.find((x) => x.id === id);
                return (
                  <View key={id} style={{ marginLeft: -4 }}>
                    <Avatar
                      name={u?.name || "Member"}
                      uri={u?.avatar}
                      size={20}
                      border
                    />
                  </View>
                );
              })}
            </View>
            <T style={{ fontSize: 10, color: "#8A988E" }}>
              A little love from{" "}
              <T
                style={{
                  fontSize: 10,
                  fontFamily: font.bold,
                  color: "#63796B",
                }}
              >
                {post.reactions.includes(user?.id || "")
                  ? "you"
                  : state.users
                      .find((x) => x.id === post.reactions[0])
                      ?.name.split(" ")[0]}
              </T>
              {post.reactions.length > 1
                ? ` and ${post.reactions.length - 1} others`
                : ""}
            </T>
          </View>
        )}
        {!detail && comments.length > 0 && (
          <Pressable
            onPress={open}
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTopWidth: 1,
              borderColor: c.line,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <T style={{ fontSize: 11, color: "#96A197" }}>
              View all {comments.length} comments
            </T>
            <ArrowUpRight size={13} color="#9AA89D" />
          </Pressable>
        )}
      </View>
    </Card>
  );
}
const s = StyleSheet.create({
  header: {
    padding: 20,
    paddingBottom: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 7 },
  menu: {
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
    backgroundColor: c.bg,
  },
  menuItem: { padding: 10, flexDirection: "row", gap: 8, alignItems: "center" },
});
