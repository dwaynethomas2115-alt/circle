import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
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
import { getPostMedia } from "../lib/postMedia";
import type { Post } from "../types";
import {
  T,
  Avatar,
  Card,
  IconButton,
  Banner,
  CircleAvatar,
} from "./primitives";
import { PostGallery } from "./PostGallery";
import { colors as c, font } from "./theme";
export { Video } from "./MediaViewer";

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

export function PostCard({
  post,
  detail = false,
}: {
  post: Post;
  detail?: boolean;
}) {
  const { state, user, actions } = useCircle();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState("");
  const author = state.users.find((u) => u.id === post.authorId);
  const circle = state.circles.find((item) => item.id === post.circleId);
  const comments = state.comments.filter((item) => item.postId === post.id);
  const media = getPostMedia(post);
  const liked = !!user && post.reactions.includes(user.id);
  const open = () => router.push(("/post/" + post.id) as never);
  const created = new Date(post.createdAt);
  const dateLabel = Number.isFinite(created.getTime())
    ? created.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Saved in your Circle";
  const firstLiker = post.reactions.includes(user?.id || "")
    ? "you"
    : state.users
        .find((item) => item.id === post.reactions[0])
        ?.name.split(" ")[0] || "a Circle member";

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

  const reactionRow = (
    <View style={s.actions}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={liked ? "Remove reaction" : "Like post"}
        onPress={async () => {
          const result = await actions.toggleReaction(post.id);
          if (!result.ok) setNotice(result.error || "Please try again.");
        }}
        style={s.action}
      >
        <Heart
          size={23}
          color={liked ? "#B86B60" : c.ink}
          fill={liked ? "#B86B60" : "none"}
          strokeWidth={1.6}
        />
        <T style={[s.actionCount, liked && { color: "#B86B60" }]}>
          {post.reactions.length}
        </T>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View comments"
        onPress={open}
        style={s.action}
      >
        <MessageCircle size={22} color={c.ink} strokeWidth={1.6} />
        <T style={s.actionCount}>{comments.length}</T>
      </Pressable>
      <View style={{ flex: 1 }} />
      {!detail && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open post"
          onPress={open}
          style={s.openPost}
        >
          <T style={s.openPostText}>Join in</T>
          <ArrowUpRight size={15} color={c.teal} strokeWidth={1.7} />
        </Pressable>
      )}
    </View>
  );

  return (
    <Card style={s.card}>
      <View style={s.header}>
        <Avatar
          name={author?.name || "Circle member"}
          uri={author?.avatar}
          size={40}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <T numberOfLines={1} style={s.author}>
            {author?.name || "Circle member"}
          </T>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${circle?.name || "Circle"}`}
            onPress={() => router.push(("/circle/" + post.circleId) as never)}
            style={s.circleLink}
          >
            {circle && (
              <CircleAvatar
                avatar={circle.avatar}
                color="transparent"
                size={14}
              />
            )}
            <T numberOfLines={1} style={s.circleName}>
              {circle?.name || "Your Circle"}
            </T>
            <T style={s.relativeTime}>· {timeAgo(post.createdAt)}</T>
          </Pressable>
        </View>
        <IconButton
          icon={MoreHorizontal}
          label="Post options"
          onPress={() => setMenu(!menu)}
          color={c.muted}
        />
      </View>
      {menu && (
        <View style={s.menu}>
          {post.authorId === user?.id && (
            <Pressable
              accessibilityRole="button"
              onPress={() => action("delete")}
              style={s.menuItem}
            >
              <Trash2 size={15} color={c.red} />
              <T style={{ fontSize: 13, color: c.red }}>Delete post</T>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => action("report")}
            style={s.menuItem}
          >
            <Flag size={15} color={c.ink} />
            <T style={{ fontSize: 13 }}>Report post</T>
          </Pressable>
          {post.authorId !== user?.id && (
            <Pressable
              accessibilityRole="button"
              onPress={() => action("block")}
              style={s.menuItem}
            >
              <UserRoundX size={15} color={c.ink} />
              <T style={{ fontSize: 13 }}>Block this person</T>
            </Pressable>
          )}
        </View>
      )}
      {!!notice && (
        <View style={{ paddingHorizontal: 20 }}>
          <Banner text={notice} onDismiss={() => setNotice("")} />
        </View>
      )}
      {media.length > 0 && <PostGallery post={post} author={author?.name} />}
      {media.length > 0 && reactionRow}
      <View style={[s.words, media.length === 0 && s.textMoment]}>
        {post.tag && (
          <View style={s.tag}>
            <T style={s.tagText}>{post.tag}</T>
          </View>
        )}
        {post.reactions.length > 0 && media.length > 0 && (
          <View style={s.likedBy}>
            <View style={s.likerAvatars}>
              {post.reactions.slice(0, 3).map((id) => {
                const liker = state.users.find((item) => item.id === id);
                return (
                  <View key={id} style={{ marginLeft: -5 }}>
                    <Avatar
                      name={liker?.name || "Member"}
                      uri={liker?.avatar}
                      size={21}
                      border
                    />
                  </View>
                );
              })}
            </View>
            <T style={s.likedText}>
              Liked by <T style={s.likedName}>{firstLiker}</T>
              {post.reactions.length > 1
                ? ` and ${post.reactions.length - 1} others`
                : ""}
            </T>
          </View>
        )}
        {!!post.content && (
          <T
            numberOfLines={!detail && !expanded ? 4 : undefined}
            style={s.caption}
          >
            {media.length > 0 && (
              <T style={s.captionAuthor}>
                {author?.name || "Circle member"}
                {"  "}
              </T>
            )}
            {post.content}
          </T>
        )}
        {!detail && !expanded && post.content.length > 280 && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setExpanded(true)}
          >
            <T style={s.readMore}>Read more</T>
          </Pressable>
        )}
        {!detail && comments.length > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={open}
            style={s.commentsLink}
          >
            <T style={s.commentsText}>
              View{" "}
              {comments.length === 1
                ? "the comment"
                : `all ${comments.length} comments`}
            </T>
          </Pressable>
        )}
      </View>
      {media.length === 0 && reactionRow}
      <View style={s.footer}>
        <T style={s.date}>{dateLabel}</T>
        <View style={s.private}>
          <LockKeyhole size={10} color={c.muted} />
          <T style={s.privateText}>Only in this Circle</T>
        </View>
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  card: {
    marginBottom: 24,
    borderRadius: 18,
    shadowOpacity: 0,
    elevation: 0,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  author: { fontFamily: font.bold, fontSize: 14, letterSpacing: -0.15 },
  circleLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  circleName: { fontSize: 11, color: "#66776D", flexShrink: 1 },
  relativeTime: { fontSize: 10, color: c.muted },
  actions: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 21,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 32 },
  actionCount: { fontFamily: font.medium, fontSize: 12, color: "#687A6D" },
  openPost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    minHeight: 32,
  },
  openPostText: { fontSize: 11, color: c.teal, fontFamily: font.medium },
  words: { paddingHorizontal: 21, gap: 10 },
  textMoment: { paddingTop: 2, paddingBottom: 4 },
  caption: { fontSize: 14, lineHeight: 23, color: "#42564A" },
  captionAuthor: { fontFamily: font.bold, fontSize: 14, color: c.ink },
  tag: {
    alignSelf: "flex-start",
    backgroundColor: "#F0F3EB",
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 9,
    fontFamily: font.bold,
    letterSpacing: 0.7,
    color: "#55705A",
  },
  likedBy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 1,
  },
  likerAvatars: { flexDirection: "row", paddingLeft: 5 },
  likedText: { fontSize: 11, color: "#6C7A6F", flex: 1, lineHeight: 17 },
  likedName: { fontSize: 11, fontFamily: font.bold, color: "#4B6152" },
  readMore: { color: c.teal, fontSize: 12, paddingVertical: 3 },
  commentsLink: { alignSelf: "flex-start", paddingVertical: 2 },
  commentsText: { fontSize: 12, color: "#7C877D" },
  footer: {
    paddingHorizontal: 21,
    paddingTop: 17,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  date: { fontSize: 10, color: "#8B948B", letterSpacing: 0.2 },
  private: { flexDirection: "row", alignItems: "center", gap: 4 },
  privateText: { fontSize: 9, color: c.muted },
  menu: {
    marginHorizontal: 18,
    marginBottom: 14,
    padding: 6,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
    backgroundColor: c.bg,
  },
  menuItem: { padding: 12, flexDirection: "row", gap: 9, alignItems: "center" },
});
