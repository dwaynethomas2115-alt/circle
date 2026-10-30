import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
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
  const post = feed.find((item) => item.id === id);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<Comment | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
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
    (comment) =>
      comment.postId === id &&
      !state.blocks.some(
        (block) =>
          block.userId === user?.id && block.blockedId === comment.authorId,
      ),
  );
  async function send() {
    if (busy || !text.trim()) return;
    setBusy(true);
    try {
      const result = await actions.addComment(id, text, reply?.id);
      if (result.ok) {
        setText("");
        setReply(null);
      } else setNotice(result.error || "Could not send comment.");
    } catch {
      setNotice("Could not send your comment. Your draft is still here.");
    } finally {
      setBusy(false);
    }
  }
  function renderComment(comment: Comment, depth = 0): React.ReactNode {
    const author = state.users.find((person) => person.id === comment.authorId);
    const children = comments.filter((child) => child.parentId === comment.id);
    return (
      <View
        key={comment.id}
        style={[s.thread, depth > 0 && depth <= 3 && s.nestedThread]}
      >
        <View style={s.comment}>
          <Avatar
            name={author?.name || "Circle member"}
            uri={author?.avatar}
            size={depth > 0 ? 28 : 34}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={s.commentHeading}>
              <T style={s.commentAuthor}>{author?.name || "Circle member"}</T>
              <T style={s.commentTime}>{timeAgo(comment.createdAt)}</T>
            </View>
            <T style={s.commentText}>{comment.content}</T>
            <View style={s.commentActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setReply(comment)}
                hitSlop={7}
                style={s.replyAction}
              >
                <CornerDownRight size={12} color={c.teal} />
                <T style={s.replyText}>Reply</T>
              </Pressable>
              {comment.authorId === user?.id ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete comment"
                  hitSlop={8}
                  onPress={async () => {
                    const result = await actions.deleteComment(comment.id);
                    if (!result.ok)
                      setNotice(result.error || "Could not delete.");
                  }}
                >
                  <Trash2 size={12} color={c.muted} />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Report comment"
                  hitSlop={8}
                  onPress={async () => {
                    const result = await actions.report(
                      "comment",
                      comment.id,
                      "Member requested moderator review.",
                    );
                    setNotice(
                      result.ok
                        ? "Comment reported for review."
                        : result.error || "Could not report.",
                    );
                  }}
                >
                  <Flag size={12} color={c.muted} />
                </Pressable>
              )}
            </View>
          </View>
        </View>
        {children.length > 0 && (
          <View style={s.replies}>
            {children.map((child) => renderComment(child, depth + 1))}
          </View>
        )}
      </View>
    );
  }
  return (
    <View style={s.page}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/")}
        style={s.back}
      >
        <ArrowLeft size={16} color={c.teal} />
        <T style={s.backText}>Back to your scrapbook</T>
      </Pressable>
      <PostCard post={post} detail />
      {!!notice && <Banner text={notice} onDismiss={() => setNotice("")} />}
      <Card style={s.conversation}>
        <View style={s.sectionHeading}>
          <View style={{ flex: 1 }}>
            <T style={s.eyebrow}>THE WORDS WE ADD</T>
            <T style={s.title}>The conversation</T>
          </View>
          <View style={s.commentBadge}>
            <T style={s.badgeText}>{comments.length}</T>
          </View>
        </View>
        {comments
          .filter(
            (comment) =>
              !comment.parentId ||
              !comments.some((parent) => parent.id === comment.parentId),
          )
          .map((comment) => renderComment(comment))}
        {comments.length === 0 && (
          <T style={s.emptyText}>
            What do you remember about this moment? Start the conversation.
          </T>
        )}
        <View style={s.composer}>
          {reply && (
            <View style={s.replying}>
              <CornerDownRight size={14} color={c.teal} />
              <T style={s.replyingText}>
                Replying to{" "}
                {state.users.find((person) => person.id === reply.authorId)
                  ?.name || "Circle member"}
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
            style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}
          >
            <Avatar name={user?.name || "You"} uri={user?.avatar} size={34} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Field
                placeholder="Add to the conversation…"
                accessibilityLabel="Comment"
                value={text}
                onChangeText={setText}
                editable={!busy}
                multiline
                maxLength={2000}
                style={s.input}
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
        </View>
      </Card>
    </View>
  );
}
const s = StyleSheet.create({
  page: { width: "100%", maxWidth: 730, alignSelf: "center" },
  back: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginBottom: 23,
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  backText: { color: c.teal, fontSize: 12, fontFamily: font.medium },
  conversation: {
    padding: 22,
    borderRadius: 18,
    shadowOpacity: 0,
    elevation: 0,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 28,
  },
  eyebrow: {
    fontSize: 9,
    fontFamily: font.bold,
    letterSpacing: 1.3,
    color: "#7A8978",
    marginBottom: 8,
  },
  title: { fontFamily: font.heading, fontSize: 22, letterSpacing: -0.6 },
  commentBadge: {
    minWidth: 33,
    height: 33,
    borderRadius: 18,
    backgroundColor: "#EEF3E9",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
  },
  badgeText: { color: c.teal, fontFamily: font.bold, fontSize: 12 },
  thread: { marginBottom: 19 },
  nestedThread: {
    marginLeft: 15,
    borderLeftWidth: 1,
    borderLeftColor: c.line,
    paddingLeft: 13,
  },
  comment: { flexDirection: "row", gap: 11 },
  commentHeading: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 3,
    marginTop: 1,
    marginBottom: 5,
  },
  commentAuthor: { fontFamily: font.bold, fontSize: 12 },
  commentTime: { fontSize: 10, color: c.muted },
  commentText: { fontSize: 14, lineHeight: 22, color: "#4D6053" },
  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 10,
  },
  replyAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 20,
  },
  replyText: { fontFamily: font.medium, fontSize: 11, color: c.teal },
  replies: { marginTop: 18 },
  emptyText: { color: c.muted, marginBottom: 24, fontSize: 13, lineHeight: 22 },
  composer: {
    borderTopWidth: 1,
    borderTopColor: c.line,
    paddingTop: 22,
    marginTop: 4,
  },
  replying: {
    backgroundColor: c.mint,
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  replyingText: { color: c.teal, fontSize: 12, flex: 1 },
  input: {
    minHeight: 88,
    backgroundColor: "#FAFBF8",
    borderRadius: 12,
    fontSize: 13,
    lineHeight: 21,
  },
});
