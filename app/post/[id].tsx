import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Send,
  CornerDownRight,
  Trash2,
  X,
  Flag,
} from "lucide-react-native";
import { useCircle } from "../../src/state/CircleProvider";
import { PostCard, timeAgo } from "../../src/ui/PostCard";
import {
  T,
  Avatar,
  Card,
  Button,
  Field,
  Empty,
  Banner,
  IconButton,
} from "../../src/ui/primitives";
import { colors as c, font } from "../../src/ui/theme";
import type { Comment } from "../../src/types";
export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, feed, user, actions } = useCircle();
  const router = useRouter();
  const post = feed.find((p) => p.id === id);
  const [text, setText] = useState(""),
    [reply, setReply] = useState<Comment | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  if (!post)
    return (
      <Empty
        title="This moment is private"
        body="The post may have been deleted, or you may no longer belong to this Circle."
      >
        <Button onPress={() => router.replace("/")}>Go home</Button>
      </Empty>
    );
  const comments = state.comments.filter(
    (x) =>
      x.postId === id &&
      !state.blocks.some(
        (b) => b.userId === user?.id && b.blockedId === x.authorId,
      ),
  );
  async function send() {
    setBusy(true);
    const r = await actions.addComment(id, text, reply?.id);
    if (r.ok) {
      setText("");
      setReply(null);
    } else setNotice(r.error || "Could not send comment.");
    setBusy(false);
  }
  function renderComment(comment: Comment, depth = 0): React.ReactNode {
    const author = state.users.find((u) => u.id === comment.authorId);
    return (
      <View
        key={comment.id}
        style={{ marginLeft: depth ? 22 : 0, marginBottom: 20 }}
      >
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Avatar
            name={author?.name || "Member"}
            uri={author?.avatar}
            size={32}
          />
          <View style={{ flex: 1 }}>
            <View
              style={{
                backgroundColor: "#F4F7F2",
                borderRadius: 12,
                padding: 13,
              }}
            >
              <T
                style={{ fontFamily: font.bold, fontSize: 12, marginBottom: 6 }}
              >
                {author?.name || "Circle member"}
              </T>
              <T style={{ fontSize: 13, lineHeight: 21, color: "#637369" }}>
                {comment.content}
              </T>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingTop: 7,
                paddingLeft: 5,
              }}
            >
              <T style={{ fontSize: 10, color: c.muted }}>
                {timeAgo(comment.createdAt)}
              </T>
              <Pressable onPress={() => setReply(comment)}>
                <T
                  style={{ fontSize: 10, color: c.teal, fontFamily: font.bold }}
                >
                  Reply
                </T>
              </Pressable>
              {comment.authorId === user?.id ? (
                <Pressable
                  accessibilityLabel="Delete comment"
                  onPress={async () => {
                    const r = await actions.deleteComment(comment.id);
                    if (!r.ok) setNotice(r.error || "Could not delete.");
                  }}
                >
                  <Trash2 size={11} color={c.muted} />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityLabel="Report comment"
                  onPress={async () => {
                    const r = await actions.report(
                      "comment",
                      comment.id,
                      "Member requested moderator review.",
                    );
                    setNotice(
                      r.ok
                        ? "Comment reported for review."
                        : r.error || "Could not report.",
                    );
                  }}
                >
                  <Flag size={11} color={c.muted} />
                </Pressable>
              )}
            </View>
          </View>
        </View>
        <View style={{ marginTop: 12 }}>
          {comments
            .filter((x) => x.parentId === comment.id)
            .map((x) => renderComment(x, depth + 1))}
        </View>
      </View>
    );
  }
  return (
    <View style={{ width: "100%", maxWidth: 730, alignSelf: "center" }}>
      <Pressable
        onPress={() => router.push("/")}
        style={{
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <ArrowLeft size={16} color={c.teal} />
        <T style={{ color: c.teal, fontSize: 12 }}>Back to your feed</T>
      </Pressable>
      <PostCard post={post} detail />
      {!!notice && <Banner text={notice} onDismiss={() => setNotice("")} />}
      <Card style={{ padding: 22 }}>
        <T style={{ fontFamily: font.heading, fontSize: 19, marginBottom: 23 }}>
          A little conversation{" "}
          <T style={{ fontSize: 13, color: c.muted }}>({comments.length})</T>
        </T>
        {comments.filter((x) => !x.parentId).map((x) => renderComment(x))}
        {comments.length === 0 && (
          <T style={{ color: c.muted, marginBottom: 25, lineHeight: 22 }}>
            Be the first to leave a little love.
          </T>
        )}
        {reply && (
          <View
            style={{
              backgroundColor: c.mint,
              padding: 10,
              borderRadius: 10,
              marginBottom: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <CornerDownRight size={14} color={c.teal} />
            <T style={{ color: c.teal, fontSize: 11, flex: 1 }}>
              Replying to{" "}
              {state.users.find((x) => x.id === reply.authorId)?.name}
            </T>
            <IconButton
              icon={X}
              label="Cancel reply"
              onPress={() => setReply(null)}
              size={14}
            />
          </View>
        )}
        <View
          style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
        >
          <Avatar name={user?.name || "You"} uri={user?.avatar} size={34} />
          <View style={{ flex: 1 }}>
            <Field
              placeholder="Leave a little love…"
              accessibilityLabel="Comment"
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
              style={{ minHeight: 75 }}
            />
            <View style={{ alignItems: "flex-end" }}>
              <Button
                icon={Send}
                disabled={!text.trim() || busy}
                onPress={send}
              >
                {busy ? "Sending…" : "Send comment"}
              </Button>
            </View>
          </View>
        </View>
      </Card>
    </View>
  );
}
