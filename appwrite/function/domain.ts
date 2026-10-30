import { randomBytes, createHash, randomUUID } from "node:crypto";
import type { AppState, Result } from "../../src/types";
import type { FeatureState, CircleTheme } from "../../src/features/types";
import { emptyCircle } from "../../src/state/empty";
import {
  transition,
  isManager,
  canModerate,
  isBlocked,
  visibleFeed,
  visibleMessages,
  visibleComments,
  type Action,
} from "../../src/state/model";
import {
  emptyFeatures,
  transitionFeatures,
  visibleFeatures,
  type FeatureAction,
} from "../../src/features/model";
import { requestSchema } from "./schema";
import { validateTheme } from "../../src/features/themes";

export interface Upload {
  owner: string;
  mediaType: "image" | "video";
  ready: boolean;
  createdAt: number;
}
export interface Store {
  generations?: Record<string, number[]>;
  proposals?: Record<string, { circleId: string; theme: CircleTheme }>;
  uploads?: Record<string, Upload>;
  app: AppState;
  features: FeatureState;
}
export const emptyStore = (): Store => ({
  app: emptyCircle(),
  features: emptyFeatures(),
});
export interface Identity {
  $id: string;
  name: string;
  email: string;
}

/** Only this projection is allowed to leave the privileged function. */
export function project(app: AppState): AppState {
  const uid = app.currentUserId;
  const joined = new Set(
    app.members.filter((m) => m.userId === uid).map((m) => m.circleId),
  );
  const posts = visibleFeed(app),
    postIds = new Set(posts.map((p) => p.id));
  const members = app.members.filter((m) => joined.has(m.circleId));
  const requests = app.requests.filter(
    (r) => r.userId === uid || isManager(app, r.circleId),
  );
  const messages = [...joined].flatMap((cid) => visibleMessages(app, cid));
  const comments = [...postIds].flatMap((pid) => visibleComments(app, pid));
  const relevant = new Set([
    uid,
    ...members.map((m) => m.userId),
    ...requests.map((r) => r.userId),
    ...posts.map((p) => p.authorId),
    ...messages.map((m) => m.authorId),
    ...comments.map((c) => c.authorId),
  ]);
  return {
    ...emptyCircle(),
    currentUserId: uid,
    users: app.users
      .filter((u) => relevant.has(u.id))
      .map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
        avatar: u.avatar,
        bio: u.bio,
        ...(u.id === uid ? { email: u.email } : {}),
      })),
    circles: app.circles
      .filter((c) => joined.has(c.id) || c.discoverable)
      .map((c) =>
        joined.has(c.id) ? c : { ...c, avatar: "🌿", cover: "", ownerId: "" },
      ),
    members,
    requests,
    posts: posts.map((p) => ({
      ...p,
      reactions: p.reactions.filter((id) => !isBlocked(app, id)),
    })),
    comments,
    messages,
    notifications: app.notifications.filter(
      (n) =>
        n.userId === uid &&
        (!n.circleId || joined.has(n.circleId)) &&
        (!n.postId || postIds.has(n.postId)),
    ),
    invitations: [], // Bearer tokens are returned only at creation, never enumerated.
    reports: app.reports.filter(
      (r) =>
        r.userId === uid || Boolean(r.circleId && canModerate(app, r.circleId)),
    ),
    blocks: app.blocks.filter((b) => b.userId === uid),
  };
}
export function execute(
  store: Store,
  identity: Identity,
  input: unknown,
): { store: Store; data: AppState | FeatureState | Result } {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("Invalid request. Check the fields and attachment format.");
  const request = parsed.data;
  const app = structuredClone(store.app);
  app.currentUserId = identity.$id; // Never accept identity from request data.
  if (!app.users.some((u) => u.id === identity.$id)) {
    app.users.push({
      id: identity.$id,
      name: identity.name || "Circle member",
      username: `user_${randomBytes(8).toString("hex")}`,
      email: identity.email,
      avatar: "",
      bio: "",
    });
  }
  const next: Store = {
    ...structuredClone(store),
    app,
    features: structuredClone(store.features),
  };
  if (request.kind === "beginUpload") {
    next.uploads ??= {};
    const pending = Object.values(next.uploads).filter(
      (u) =>
        u.owner === identity.$id &&
        !u.ready &&
        u.createdAt > Date.now() - 86400000,
    );
    if (pending.length >= 10)
      throw new Error(
        "Too many unfinished uploads. Ask the administrator to clean up pending uploads.",
      );
    const fileId = randomUUID();
    next.uploads[fileId] = {
      owner: identity.$id,
      mediaType: request.mediaType,
      ready: false,
      createdAt: Date.now(),
    };
    return { store: next, data: { ok: true, id: fileId } };
  }
  if (request.kind === "finishUpload") {
    const upload = next.uploads?.[request.fileId];
    if (
      !upload ||
      upload.owner !== identity.$id ||
      (!upload.ready && upload.createdAt < Date.now() - 86400000)
    )
      throw new Error("Upload unavailable.");
    upload.ready = true; // The handler verifies Storage metadata/permissions before this command.
    return { store: next, data: { ok: true } };
  }
  if (request.kind === "room")
    throw new Error(
      "Live rooms are not enabled for Appwrite. The local demo self-preview remains available.",
    );
  if (request.kind === "generateTheme") {
    if (!isManager(app, request.circleId))
      throw new Error("Only Circle owners and admins can generate themes.");
    next.generations ??= {};
    const recent = (next.generations[identity.$id] || []).filter(
      (t) => t > Date.now() - 86400000,
    );
    if (recent.length >= 10 || recent.some((t) => t > Date.now() - 60000))
      throw new Error(
        "Theme generation limit reached. Wait a minute and try again (maximum 10 per day).",
      );
    next.generations[identity.$id] = [...recent, Date.now()];
    return { store: next, data: { ok: true } }; // Quota is committed before any paid provider request.
  }
  if (request.kind === "snapshot") return { store: next, data: project(app) };
  if (request.kind === "features")
    return { store: next, data: visibleFeatures(next.features, app) };
  if (request.kind === "action") {
    if (request.action.type === "deleteAccount")
      throw new Error(
        "Appwrite account deletion is not implemented yet. Contact your administrator; no account or data was deleted.",
      );
    // Do not let callers probe arbitrary unrelated account IDs through block actions.
    if (
      request.action.type === "blockUser" &&
      !project(app).users.some(
        (u) =>
          u.id ===
          (request.action as Extract<Action, { type: "blockUser" }>).userId,
      )
    )
      throw new Error("Profile unavailable.");
    const verifyMedia = (
      value: string | undefined,
      previous?: string,
      expected: "image" | "video" = "image",
    ) => {
      if (!value?.startsWith("awfile:")) return;
      const upload = next.uploads?.[value.slice(7)];
      if (
        !upload?.ready ||
        upload.mediaType !== expected ||
        (upload.owner !== identity.$id && value !== previous)
      )
        throw new Error(
          "This attachment is unavailable or belongs to another account.",
        );
    };
    const a = request.action;
    if (a.type === "createPost")
      verifyMedia(a.input.media, undefined, a.input.mediaType || "image");
    if (a.type === "updateProfile")
      verifyMedia(
        a.patch.avatar,
        app.users.find((u) => u.id === identity.$id)?.avatar,
      );
    if (a.type === "createCircle") {
      verifyMedia(a.input.avatar);
      verifyMedia(a.input.cover);
    }
    if (a.type === "updateCircle") {
      const previous = app.circles.find((c) => c.id === a.circleId);
      verifyMedia(a.patch.avatar, previous?.avatar);
      verifyMedia(a.patch.cover, previous?.cover);
    }
    const command =
      request.action.type === "redeemInvitation"
        ? {
            ...request.action,
            code: createHash("sha256")
              .update(request.action.code.trim().toUpperCase())
              .digest("hex")
              .toUpperCase(),
          }
        : request.action;
    const outcome = transition(app, command as Action);
    if (!outcome.result.ok) return { store: next, data: outcome.result };
    next.app = outcome.state;
    if (request.action.type === "createInvitation") {
      const invitation = next.app.invitations.find(
        (i) => i.id === outcome.result.id,
      )!;
      const token = randomBytes(24).toString("hex").toUpperCase();
      invitation.code = createHash("sha256")
        .update(token)
        .digest("hex")
        .toUpperCase();
      outcome.result.code = token;
    }
    // Revoked members must not retain pending approvals or reusable invitations.
    if (
      request.action.type === "removeMember" ||
      request.action.type === "leaveCircle"
    ) {
      const circleId = request.action.circleId;
      const removed =
        request.action.type === "removeMember"
          ? request.action.userId
          : identity.$id;
      next.app.invitations = next.app.invitations.filter(
        (i) => !(i.circleId === circleId && i.createdBy === removed),
      );
      next.app.requests = next.app.requests.filter(
        (r) => !(r.circleId === circleId && r.userId === removed),
      );
    }
    return { store: next, data: outcome.result };
  }
  if (
    request.action.type === "saveTheme" &&
    request.action.theme.source === "ai"
  ) {
    const proposal = next.proposals?.[identity.$id];
    const theme = request.action.theme;
    if (
      !isManager(app, request.action.circleId) ||
      !proposal ||
      proposal.circleId !== request.action.circleId ||
      Object.keys(proposal.theme).some(
        (key) =>
          proposal.theme[key as keyof CircleTheme] !==
          theme[key as keyof CircleTheme],
      ) ||
      !validateTheme(request.action.theme)
    )
      throw new Error(
        "Generate a fresh authorized theme preview before applying it.",
      );
    next.features.themes[request.action.circleId] = proposal.theme;
    return { store: next, data: { ok: true } };
  }
  const outcome = transitionFeatures(
    next.features,
    app,
    request.action as FeatureAction,
  );
  if (outcome.result.ok) next.features = outcome.state;
  return { store: next, data: outcome.result };
}

/** Internal-only completion: never accepted as a client command. Rechecks current access. */
export function recordTheme(
  store: Store,
  identity: Identity,
  circleId: string,
  theme: CircleTheme,
): Store {
  const next = structuredClone(store);
  next.app.currentUserId = identity.$id;
  if (!isManager(next.app, circleId) || !validateTheme(theme))
    throw new Error("Your Circle access changed; the theme was not saved.");
  next.proposals ??= {};
  next.proposals[identity.$id] = { circleId, theme };
  next.app.currentUserId = null;
  return next;
}
