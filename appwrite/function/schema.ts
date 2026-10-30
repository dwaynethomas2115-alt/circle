import { z } from "zod";
const id = z.string().min(1).max(128);
const text = (max: number) => z.string().max(max);
const file = z.string().regex(/^awfile:[a-f0-9-]{36}$/);
const avatar = z.union([
  file,
  text(32).refine(
    (v) => !/[:/\\.]/.test(v),
    "Choose an emoji or upload an image.",
  ),
]);
const circle = z
  .object({
    name: text(80),
    description: text(1000),
    category: z.enum([
      "Family",
      "Friends",
      "School",
      "Community",
      "Hobby",
      "Other",
    ]),
    avatar: avatar.optional(),
    cover: z.union([file, z.literal("")]).optional(),
    discoverable: z.boolean(),
    approvalRequired: z.boolean().optional(),
  })
  .strict();
const action = <
  T extends string,
  S extends z.ZodRawShape = Record<never, never>,
>(
  type: T,
  shape: S = {} as S,
) => z.object({ type: z.literal(type), ...shape }).strict();
export const actionSchema = z.union([
  action("updateProfile", {
    patch: z
      .object({
        name: text(80).optional(),
        username: text(24).optional(),
        bio: text(280).optional(),
        avatar: avatar.optional(),
      })
      .strict(),
  }),
  action("createCircle", { input: circle }),
  action("updateCircle", { circleId: id, patch: circle.partial() }),
  action("requestJoin", { circleId: id }),
  action("respondRequest", { requestId: id, approve: z.boolean() }),
  action("createInvitation", { circleId: id }),
  action("redeemInvitation", { code: text(128) }),
  action("leaveCircle", { circleId: id }),
  action("removeMember", { circleId: id, userId: id }),
  action("setRole", {
    circleId: id,
    userId: id,
    role: z.enum(["owner", "admin", "moderator", "member"]),
  }),
  action("createPost", {
    input: z
      .object({
        circleId: id,
        content: text(5000),
        media: z.union([file, z.literal("")]).optional(),
        mediaType: z.enum(["image", "video"]).optional(),
        mediaDurationMs: z.number().optional(),
      })
      .strict(),
  }),
  action("deletePost", { postId: id }),
  action("toggleReaction", { postId: id }),
  action("addComment", {
    postId: id,
    content: text(2000),
    parentId: id.optional(),
  }),
  action("deleteComment", { commentId: id }),
  action("sendMessage", { circleId: id, content: text(4000) }),
  action("deleteMessage", { messageId: id }),
  action("markRead", { id: id.optional() }),
  action("report", {
    targetType: z.enum(["post", "comment", "message"]),
    targetId: id,
    reason: text(1000),
  }),
  action("blockUser", { userId: id }),
  action("deleteAccount"),
]);
const theme = z
  .object({
    id,
    label: text(60),
    prompt: text(1000),
    accent: text(7),
    background: text(7),
    surface: text(7),
    ink: text(7),
    motif: z.enum(["garden", "unicorn", "vegas", "coast", "minimal"]),
    source: z.enum(["preset", "ai"]),
    wallpaperPath: z
      .string()
      .regex(
        /^[A-Za-z0-9_-]{1,128}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/,
      )
      .optional(),
  })
  .strict();
export const featureSchema = z.union([
  action("createPoll", {
    circleId: id,
    question: text(240),
    options: z.array(text(100)).min(2).max(6),
    closesAt: text(40).optional(),
  }),
  action("vote", { pollId: id, optionId: id }),
  action("closePoll", { pollId: id }),
  action("deletePoll", { pollId: id }),
  action("createEvent", {
    input: z
      .object({
        circleId: id,
        title: text(120),
        description: text(2000),
        location: text(240),
        startsAt: text(40),
        endsAt: text(40),
      })
      .strict(),
  }),
  action("deleteEvent", { eventId: id }),
  action("rsvpEvent", {
    eventId: id,
    response: z.enum(["going", "maybe", "not_going"]),
  }),
  action("markCaughtUp", { circleId: id, seenAt: text(40) }),
  action("saveTheme", { circleId: id, theme }),
]);
export const requestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("beginUpload"),
      mediaType: z.enum(["image", "video"]),
    })
    .strict(),
  z
    .object({ kind: z.literal("finishUpload"), fileId: z.string().uuid() })
    .strict(),
  z
    .object({ kind: z.literal("cancelUpload"), fileId: z.string().uuid() })
    .strict(),
  z.object({ kind: z.literal("snapshot") }).strict(),
  z.object({ kind: z.literal("features") }).strict(),
  z.object({ kind: z.literal("action"), action: actionSchema }).strict(),
  z
    .object({ kind: z.literal("featureAction"), action: featureSchema })
    .strict(),
  z
    .object({
      kind: z.literal("generateTheme"),
      circleId: id,
      prompt: text(1000).min(3),
    })
    .strict(),
  z
    .object({
      kind: z.literal("themeWallpaper"),
      wallpaperPath: z
        .string()
        .regex(
          /^[A-Za-z0-9_-]{1,128}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/,
        ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("room"),
      circleId: id,
      action: z.enum(["join", "status"]),
    })
    .strict(),
]);
