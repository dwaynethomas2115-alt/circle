import {
  AppState,
  Category,
  CreateCircleInput,
  CreatePostInput,
  Profile,
  Result,
  Role,
} from "../types";
import { createSeed } from "../data/seed";
export type Action =
  | { type: "signIn"; email: string; name?: string }
  | {
      type: "signUp";
      name: string;
      username: string;
      email: string;
      adult: boolean;
    }
  | { type: "signOut" }
  | { type: "deleteAccount" }
  | { type: "resetDemo" }
  | { type: "updateProfile"; patch: Partial<Profile> }
  | { type: "createCircle"; input: CreateCircleInput }
  | {
      type: "updateCircle";
      circleId: string;
      patch: Partial<CreateCircleInput>;
    }
  | { type: "requestJoin"; circleId: string }
  | { type: "respondRequest"; requestId: string; approve: boolean }
  | { type: "createInvitation"; circleId: string }
  | { type: "redeemInvitation"; code: string }
  | { type: "leaveCircle"; circleId: string }
  | { type: "removeMember"; circleId: string; userId: string }
  | { type: "setRole"; circleId: string; userId: string; role: Role }
  | { type: "createPost"; input: CreatePostInput }
  | { type: "deletePost"; postId: string }
  | { type: "toggleReaction"; postId: string }
  | { type: "addComment"; postId: string; content: string; parentId?: string }
  | { type: "deleteComment"; commentId: string }
  | { type: "sendMessage"; circleId: string; content: string }
  | { type: "deleteMessage"; messageId: string }
  | { type: "markRead"; id?: string }
  | {
      type: "report";
      targetType: "post" | "comment" | "message";
      targetId: string;
      reason: string;
    }
  | { type: "blockUser"; userId: string }
  | { type: "setTheme"; theme: AppState["theme"] };
export interface Transition {
  state: AppState;
  result: Result;
}
const id = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const time = () => new Date().toISOString();
const categories: Category[] = [
  "Family",
  "Friends",
  "School",
  "Community",
  "Hobby",
  "Other",
];
const emailValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export function membership(
  s: AppState,
  circleId: string,
  userId = s.currentUserId,
) {
  return s.members.find((m) => m.circleId === circleId && m.userId === userId);
}
export function isManager(s: AppState, circleId: string) {
  return ["owner", "admin"].includes(membership(s, circleId)?.role || "");
}
export function canModerate(s: AppState, circleId: string) {
  return ["owner", "admin", "moderator"].includes(
    membership(s, circleId)?.role || "",
  );
}
export function isBlocked(s: AppState, otherId: string) {
  return s.blocks.some(
    (b) =>
      (b.userId === s.currentUserId && b.blockedId === otherId) ||
      (b.userId === otherId && b.blockedId === s.currentUserId),
  );
}
export function visibleFeed(s: AppState, circleId?: string) {
  return s.posts
    .filter(
      (p) =>
        (!circleId || p.circleId === circleId) &&
        !!membership(s, p.circleId) &&
        !isBlocked(s, p.authorId),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
export function visibleMessages(s: AppState, circleId: string) {
  return membership(s, circleId)
    ? s.messages
        .filter((m) => m.circleId === circleId && !isBlocked(s, m.authorId))
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    : [];
}
export function visibleComments(s: AppState, postId: string) {
  const p = s.posts.find((x) => x.id === postId);
  return p && membership(s, p.circleId) && !isBlocked(s, p.authorId)
    ? s.comments.filter((c) => c.postId === postId && !isBlocked(s, c.authorId))
    : [];
}
export function transition(previous: AppState, action: Action): Transition {
  const fail = (error: string): Transition => ({
    state: previous,
    result: { ok: false, error },
  });
  // State contains JSON values only; this clone also works on native Hermes runtimes.
  const s: AppState = JSON.parse(JSON.stringify(previous)) as AppState;
  const success = (result: Partial<Result> = {}): Transition => ({
    state: s,
    result: { ok: true, ...result },
  });
  const notify = (
    userId: string,
    title: string,
    body: string,
    type: AppState["notifications"][number]["type"],
    circleId?: string,
    postId?: string,
  ) => {
    if (userId !== s.currentUserId)
      s.notifications.unshift({
        id: id("notification"),
        userId,
        title,
        body,
        type,
        circleId,
        postId,
        read: false,
        createdAt: time(),
      });
  };
  if (action.type === "resetDemo")
    return { state: createSeed(), result: { ok: true } };
  if (action.type === "signIn") {
    const user = s.users.find(
      (u) => u.email?.toLowerCase() === action.email.trim().toLowerCase(),
    );
    if (!user)
      return fail(
        "No local demo account uses that email. Create an account, or use alex@example.com.",
      );
    s.currentUserId = user.id;
    return success();
  }
  if (action.type === "signUp") {
    if (!action.adult)
      return fail("Circle currently supports adults aged 18 and over.");
    const name = action.name.trim(),
      username = action.username.trim().toLowerCase().replace(/^@/, "");
    const email = action.email.trim().toLowerCase();
    if (name.length < 2 || name.length > 80)
      return fail("Enter a name between 2 and 80 characters.");
    if (!/^[a-z0-9_]{3,24}$/.test(username))
      return fail(
        "Use 3–24 letters, numbers, or underscores for your username.",
      );
    if (!emailValid(email)) return fail("Enter a valid email address.");
    if (
      s.users.some(
        (u) => u.username === username || u.email?.toLowerCase() === email,
      )
    )
      return fail("That username or email is already in use on this device.");
    const userId = id("user");
    s.users.push({ id: userId, name, username, email, avatar: "", bio: "" });
    s.currentUserId = userId;
    return success({ id: userId });
  }
  if (action.type === "signOut") {
    s.currentUserId = null;
    return success();
  }
  const userId = s.currentUserId;
  if (!userId) return fail("Sign in to continue.");
  const user = s.users.find((u) => u.id === userId);
  if (!user)
    return fail(
      "Your local profile could not be found. Reset the demo to continue.",
    );
  switch (action.type) {
    case "updateProfile": {
      const name = (action.patch.name ?? user.name).trim();
      const username = (action.patch.username ?? user.username)
        .trim()
        .replace(/^@/, "")
        .toLowerCase();
      if (name.length < 2 || name.length > 80)
        return fail("Enter a name between 2 and 80 characters.");
      if (!/^[a-z0-9_]{3,24}$/.test(username))
        return fail(
          "Use 3–24 letters, numbers, or underscores for your username.",
        );
      if (s.users.some((u) => u.id !== userId && u.username === username))
        return fail("That username is already in use.");
      Object.assign(user, {
        name,
        username,
        bio: (action.patch.bio ?? user.bio).slice(0, 280),
        avatar: action.patch.avatar ?? user.avatar,
      });
      return success();
    }
    case "createCircle": {
      const input = action.input;
      const name = input.name.trim();
      if (name.length < 3 || name.length > 80)
        return fail("Give your Circle a name between 3 and 80 characters.");
      if (!categories.includes(input.category))
        return fail("Choose a Circle category.");
      const circleId = id("circle");
      s.circles.unshift({
        id: circleId,
        name,
        description: input.description.trim().slice(0, 1000),
        category: input.category,
        avatar: input.avatar || "🌿",
        cover: input.cover || "",
        color: "#DCEEE7",
        discoverable: input.discoverable,
        approvalRequired: input.approvalRequired ?? true,
        ownerId: userId,
        createdAt: time(),
      });
      s.members.push({ circleId, userId, role: "owner", joinedAt: time() });
      return success({ id: circleId });
    }
    case "updateCircle": {
      if (!isManager(s, action.circleId))
        return fail("Only owners and admins can update this Circle.");
      const circle = s.circles.find((c) => c.id === action.circleId);
      if (!circle) return fail("Circle not found.");
      const p = action.patch;
      if (
        p.name !== undefined &&
        (p.name.trim().length < 3 || p.name.length > 80)
      )
        return fail("Use a Circle name between 3 and 80 characters.");
      if (p.category !== undefined && !categories.includes(p.category))
        return fail("Choose a valid category.");
      if (p.name !== undefined) circle.name = p.name.trim();
      if (p.description !== undefined)
        circle.description = p.description.trim().slice(0, 1000);
      if (p.category !== undefined) circle.category = p.category;
      if (p.avatar !== undefined) circle.avatar = p.avatar;
      if (p.cover !== undefined) circle.cover = p.cover;
      if (p.discoverable !== undefined) circle.discoverable = p.discoverable;
      if (p.approvalRequired !== undefined)
        circle.approvalRequired = p.approvalRequired;
      return success();
    }
    case "requestJoin": {
      const c = s.circles.find((c) => c.id === action.circleId);
      if (!c?.discoverable) return fail("This Circle is invitation-only.");
      if (membership(s, c.id)) return fail("You are already a member.");
      if (
        s.requests.some(
          (r) =>
            r.userId === userId &&
            r.circleId === c.id &&
            r.status === "pending",
        )
      )
        return fail("Your request is already pending.");
      if (!c.approvalRequired) {
        s.members.push({
          circleId: c.id,
          userId,
          role: "member",
          joinedAt: time(),
        });
        return success({ id: c.id, code: "joined" });
      }
      const requestId = id("request");
      s.requests.push({
        id: requestId,
        circleId: c.id,
        userId,
        status: "pending",
        createdAt: time(),
      });
      s.members
        .filter(
          (m) => m.circleId === c.id && ["owner", "admin"].includes(m.role),
        )
        .forEach((m) =>
          notify(
            m.userId,
            "Someone wants to join",
            `${user.name} requested access to ${c.name}.`,
            "request",
            c.id,
          ),
        );
      return success({ id: requestId, code: "pending" });
    }
    case "respondRequest": {
      const request = s.requests.find((r) => r.id === action.requestId);
      if (!request) return fail("Request not found.");
      if (!isManager(s, request.circleId))
        return fail("Only owners and admins can manage requests.");
      if (request.status !== "pending")
        return fail("This request has already been reviewed.");
      request.status = action.approve ? "approved" : "rejected";
      if (action.approve && !membership(s, request.circleId, request.userId))
        s.members.push({
          circleId: request.circleId,
          userId: request.userId,
          role: "member",
          joinedAt: time(),
        });
      const c = s.circles.find((c) => c.id === request.circleId);
      notify(
        request.userId,
        action.approve ? "Welcome to the Circle" : "Request update",
        action.approve
          ? `You’re now part of ${c?.name}.`
          : `Your request to join ${c?.name} was not approved.`,
        "approval",
        request.circleId,
      );
      return success();
    }
    case "createInvitation": {
      if (!isManager(s, action.circleId))
        return fail("Only owners and admins can invite people.");
      const code = Math.random().toString(36).slice(2, 10).toUpperCase();
      const invitationId = id("invitation");
      s.invitations.push({
        id: invitationId,
        circleId: action.circleId,
        code,
        createdBy: userId,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      });
      return success({ id: invitationId, code });
    }
    case "redeemInvitation": {
      const inv = s.invitations.find(
        (i) => i.code === action.code.trim().toUpperCase(),
      );
      if (!inv || inv.usedBy || Date.parse(inv.expiresAt) < Date.now())
        return fail("That invitation is invalid, expired, or already used.");
      if (membership(s, inv.circleId))
        return fail("You are already in this Circle.");
      inv.usedBy = userId;
      s.members.push({
        circleId: inv.circleId,
        userId,
        role: "member",
        joinedAt: time(),
      });
      return success({ id: inv.circleId });
    }
    case "leaveCircle": {
      const member = membership(s, action.circleId);
      if (!member) return fail("You are not a member.");
      if (member.role === "owner")
        return fail("Transfer ownership before leaving your Circle.");
      s.members = s.members.filter(
        (m) => !(m.circleId === action.circleId && m.userId === userId),
      );
      return success();
    }
    case "removeMember": {
      if (!isManager(s, action.circleId))
        return fail("Only owners and admins can remove members.");
      const target = membership(s, action.circleId, action.userId);
      if (!target) return fail("Member not found.");
      if (target.role === "owner") return fail("The owner cannot be removed.");
      if (
        target.role === "admin" &&
        membership(s, action.circleId)?.role !== "owner"
      )
        return fail("Only the owner can remove an admin.");
      s.members = s.members.filter(
        (m) => !(m.circleId === action.circleId && m.userId === action.userId),
      );
      return success();
    }
    case "setRole": {
      const actor = membership(s, action.circleId),
        target = membership(s, action.circleId, action.userId);
      if (!actor || !target) return fail("Membership not found.");
      if (actor.role !== "owner")
        return fail("Only the owner can assign roles.");
      if (action.userId === userId)
        return fail("Choose another member to transfer ownership.");
      if (!["owner", "admin", "moderator", "member"].includes(action.role))
        return fail("Choose a valid role.");
      if (action.role === "owner") {
        actor.role = "admin";
        const c = s.circles.find((c) => c.id === action.circleId);
        if (c) c.ownerId = action.userId;
      }
      target.role = action.role;
      return success();
    }
    case "createPost": {
      const input = action.input;
      if (!membership(s, input.circleId))
        return fail("Join this Circle before posting.");
      const content = input.content.trim();
      if (!content && !input.media)
        return fail("Add a thought, photo, or video to your post.");
      if (content.length > 5000)
        return fail("Keep your post under 5,000 characters.");
      const postId = id("post");
      s.posts.unshift({
        id: postId,
        circleId: input.circleId,
        authorId: userId,
        content,
        media: input.media,
        mediaType: input.mediaType,
        createdAt: time(),
        reactions: [],
      });
      s.members
        .filter((m) => m.circleId === input.circleId)
        .forEach((m) =>
          notify(
            m.userId,
            "A new moment in your Circle",
            `${user.name} shared something with you.`,
            "post",
            input.circleId,
            postId,
          ),
        );
      return success({ id: postId });
    }
    case "deletePost": {
      const post = s.posts.find((p) => p.id === action.postId);
      if (!post || !membership(s, post.circleId))
        return fail("Post not found.");
      if (post.authorId !== userId && !canModerate(s, post.circleId))
        return fail("You can only delete your own posts.");
      s.posts = s.posts.filter((p) => p.id !== post.id);
      s.comments = s.comments.filter((c) => c.postId !== post.id);
      s.notifications = s.notifications.filter((n) => n.postId !== post.id);
      return success();
    }
    case "toggleReaction": {
      const post = s.posts.find((p) => p.id === action.postId);
      if (!post || !membership(s, post.circleId) || isBlocked(s, post.authorId))
        return fail("Post not found.");
      if (post.reactions.includes(userId))
        post.reactions = post.reactions.filter((x) => x !== userId);
      else {
        post.reactions.push(userId);
        notify(
          post.authorId,
          "A little love for your post",
          `${user.name} reacted to your post.`,
          "reaction",
          post.circleId,
          post.id,
        );
      }
      return success();
    }
    case "addComment": {
      const post = s.posts.find((p) => p.id === action.postId);
      if (!post || !membership(s, post.circleId) || isBlocked(s, post.authorId))
        return fail("Post not found.");
      const content = action.content.trim();
      if (!content || content.length > 2000)
        return fail("Write a comment between 1 and 2,000 characters.");
      const parent = action.parentId
        ? s.comments.find(
            (c) => c.id === action.parentId && c.postId === post.id,
          )
        : undefined;
      if (action.parentId && !parent)
        return fail("That reply is no longer available.");
      const commentId = id("comment");
      s.comments.push({
        id: commentId,
        postId: post.id,
        authorId: userId,
        content,
        parentId: action.parentId,
        createdAt: time(),
      });
      notify(
        post.authorId,
        "A new conversation",
        `${user.name} commented on your post.`,
        "comment",
        post.circleId,
        post.id,
      );
      if (parent && parent.authorId !== post.authorId)
        notify(
          parent.authorId,
          "Someone replied to you",
          `${user.name} replied to your comment.`,
          "comment",
          post.circleId,
          post.id,
        );
      return success({ id: commentId });
    }
    case "deleteComment": {
      const comment = s.comments.find((c) => c.id === action.commentId);
      const post = s.posts.find((p) => p.id === comment?.postId);
      if (!comment || !post || !membership(s, post.circleId))
        return fail("Comment not found.");
      if (comment.authorId !== userId && !canModerate(s, post.circleId))
        return fail("You can only delete your own comments.");
      // Preserve descendant conversations while removing the deleted text.
      if (s.comments.some((c) => c.parentId === comment.id))
        comment.content = "[Comment deleted]";
      else s.comments = s.comments.filter((c) => c.id !== comment.id);
      return success();
    }
    case "sendMessage": {
      if (!membership(s, action.circleId))
        return fail("Join this Circle to send a message.");
      const content = action.content.trim();
      if (!content || content.length > 4000)
        return fail("Write a message between 1 and 4,000 characters.");
      const messageId = id("message");
      s.messages.push({
        id: messageId,
        circleId: action.circleId,
        authorId: userId,
        content,
        createdAt: time(),
      });
      return success({ id: messageId });
    }
    case "deleteMessage": {
      const message = s.messages.find((m) => m.id === action.messageId);
      if (!message || !membership(s, message.circleId))
        return fail("Message not found.");
      if (message.authorId !== userId && !canModerate(s, message.circleId))
        return fail("You can only delete your own messages.");
      s.messages = s.messages.filter((m) => m.id !== message.id);
      return success();
    }
    case "markRead":
      s.notifications.forEach((n) => {
        if (n.userId === userId && (!action.id || n.id === action.id))
          n.read = true;
      });
      return success();
    case "report": {
      const target =
        action.targetType === "post"
          ? s.posts.find((p) => p.id === action.targetId)
          : action.targetType === "message"
            ? s.messages.find((m) => m.id === action.targetId)
            : s.comments.find((c) => c.id === action.targetId);
      const circleId =
        target &&
        ("circleId" in target
          ? target.circleId
          : s.posts.find((p) => p.id === target.postId)?.circleId);
      if (!target || !circleId || !membership(s, circleId))
        return fail("Content not found.");
      if (action.reason.trim().length < 3)
        return fail("Tell us a little about the issue.");
      s.reports.push({
        id: id("report"),
        userId,
        circleId,
        targetType: action.targetType,
        targetId: action.targetId,
        reason: action.reason.trim().slice(0, 1000),
        createdAt: time(),
      });
      return success();
    }
    case "blockUser": {
      if (action.userId === userId) return fail("You cannot block yourself.");
      if (!s.users.some((u) => u.id === action.userId))
        return fail("Profile not found.");
      const existing = s.blocks.findIndex(
        (b) => b.userId === userId && b.blockedId === action.userId,
      );
      if (existing >= 0) s.blocks.splice(existing, 1);
      else s.blocks.push({ userId, blockedId: action.userId });
      return success();
    }
    case "setTheme":
      s.theme = action.theme;
      return success();
    case "deleteAccount": {
      // Demo deletion removes owned Circles and their data. Real account deletion is a backend RPC.
      const circles = new Set(
        s.circles.filter((c) => c.ownerId === userId).map((c) => c.id),
      );
      s.circles = s.circles.filter((c) => !circles.has(c.id));
      s.members = s.members.filter(
        (m) => m.userId !== userId && !circles.has(m.circleId),
      );
      const posts = new Set(
        s.posts
          .filter((p) => p.authorId === userId || circles.has(p.circleId))
          .map((p) => p.id),
      );
      s.posts = s.posts
        .filter((p) => !posts.has(p.id))
        .map((p) => ({
          ...p,
          reactions: p.reactions.filter((u) => u !== userId),
        }));
      s.comments = s.comments.filter(
        (c) => c.authorId !== userId && !posts.has(c.postId),
      );
      const survivingComments = new Set(s.comments.map((c) => c.id));
      s.comments = s.comments.map((c) =>
        c.parentId && !survivingComments.has(c.parentId)
          ? { ...c, parentId: undefined }
          : c,
      );
      s.messages = s.messages.filter(
        (m) => m.authorId !== userId && !circles.has(m.circleId),
      );
      s.requests = s.requests.filter(
        (r) => r.userId !== userId && !circles.has(r.circleId),
      );
      s.invitations = s.invitations.filter(
        (i) => i.createdBy !== userId && !circles.has(i.circleId),
      );
      s.notifications = s.notifications.filter(
        (n) =>
          n.userId !== userId &&
          (!n.circleId || !circles.has(n.circleId)) &&
          (!n.postId || !posts.has(n.postId)),
      );
      s.blocks = s.blocks.filter(
        (b) => b.userId !== userId && b.blockedId !== userId,
      );
      s.reports = s.reports.filter(
        (r) => r.userId !== userId && (!r.circleId || !circles.has(r.circleId)),
      );
      s.users = s.users.filter((u) => u.id !== userId);
      s.currentUserId = null;
      return success();
    }
  }
}
