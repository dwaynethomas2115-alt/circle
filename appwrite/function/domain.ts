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
  canceled?: boolean;
  createdAt: number;
}
export interface ThemeQuota {
  attempts: number[];
  successes: { id: string; at: number }[];
  pending?: { id: string; circleId: string; startedAt: number };
  job?: {
    requestId: string;
    circleId: string;
    promptHash: string;
    createdAt: number;
    status: "prepared" | "processing" | "completed" | "failed";
    failure?: ThemeFailure;
  };
}
export interface ThemeFailure {
  error: string;
  code: string;
  responseStatus: number;
  retryAfterSeconds?: number;
  resetAt?: string;
}
export type ThemeJobResult =
  | { status: "pending" }
  | { status: "completed"; theme: CircleTheme }
  | ({ status: "failed" } & ThemeFailure);
export interface Store {
  generations?: Record<string, number[] | ThemeQuota>;
  proposals?: Record<
    string,
    {
      circleId: string;
      theme: CircleTheme;
      createdAt?: number;
      requestId?: string;
    }
  >;
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
): {
  store: Store;
  data:
    AppState | FeatureState | Result | ThemeJobResult | { requestId: string };
} {
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
        !u.canceled &&
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
  if (request.kind === "cancelUpload") {
    const upload = next.uploads?.[request.fileId];
    if (!upload || upload.owner !== identity.$id || upload.ready)
      throw new Error("Only your unfinished uploads can be canceled.");
    upload.canceled = true;
    upload.ready = false;
    return { store: next, data: { ok: true } };
  }
  if (request.kind === "finishUpload") {
    const upload = next.uploads?.[request.fileId];
    if (
      !upload ||
      upload.owner !== identity.$id ||
      upload.canceled ||
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
  if (
    request.kind === "prepareTheme" ||
    request.kind === "generateTheme" ||
    request.kind === "themeResult"
  ) {
    if (!isManager(app, request.circleId))
      throw new Error("Only Circle owners and admins can generate themes.");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(request.circleId))
      throw new Error(
        "This Circle cannot store a wallpaper. Contact the app owner.",
      );
    if (request.kind === "prepareTheme") {
      const reserved = reserveTheme(
        next,
        identity,
        request.circleId,
        request.prompt,
      );
      return { store: reserved.store, data: { requestId: reserved.data.id! } };
    }
    if (request.kind === "generateTheme") {
      if (!request.requestId)
        throw new ThemeError(
          "Refresh Circle to update wallpaper generation before trying again.",
          409,
          "theme_client_update_required",
        );
      const quota = themeQuota(next.generations?.[identity.$id]);
      const job = quota.job;
      if (
        !job ||
        job.requestId !== request.requestId ||
        job.circleId !== request.circleId ||
        job.promptHash !== themePromptHash(request.prompt)
      )
        throw unavailableTheme();
      if (job.status !== "prepared")
        return {
          store: next,
          data: { ok: true, id: job.requestId, code: "theme_existing" },
        };
      if (quota.pending?.id !== job.requestId) throw unavailableTheme();
      job.status = "processing";
      next.generations ??= {};
      next.generations[identity.$id] = quota;
      return {
        store: next,
        data: { ok: true, id: job.requestId, code: "theme_claimed" },
      };
    }
    const quota = themeQuota(next.generations?.[identity.$id]);
    const job = quota.job;
    if (
      !job ||
      job.requestId !== request.requestId ||
      job.circleId !== request.circleId
    )
      throw unavailableTheme();
    if (job.status === "failed" && job.failure)
      return { store: next, data: { status: "failed", ...job.failure } };
    if (job.status === "completed") {
      const proposal = next.proposals?.[identity.$id];
      if (
        !proposal ||
        proposal.circleId !== request.circleId ||
        (proposal.createdAt || 0) < Date.now() - 86_400_000 ||
        !hasThemeCompletion(next, identity, job.requestId, proposal.theme)
      )
        throw unavailableTheme();
      return {
        store: next,
        data: { status: "completed", theme: proposal.theme },
      };
    }
    return {
      store: next,
      data:
        quota.pending?.id === job.requestId
          ? { status: "pending" }
          : {
              status: "failed",
              error:
                "This wallpaper request expired. Generate a fresh preview.",
              code: "theme_request_expired",
              responseStatus: 410,
            },
    };
  }
  if (request.kind === "themeWallpaper") {
    const circleId = request.wallpaperPath.split("/")[0];
    if (
      !app.members.some(
        (member) =>
          member.circleId === circleId && member.userId === identity.$id,
      )
    )
      throw new Error("Wallpaper unavailable.");
    const active =
      next.features.themes[circleId]?.wallpaperPath === request.wallpaperPath;
    const proposal = next.proposals?.[identity.$id];
    const preview =
      isManager(app, circleId) &&
      proposal?.circleId === circleId &&
      proposal.theme.wallpaperPath === request.wallpaperPath &&
      (proposal.createdAt || 0) > Date.now() - 86_400_000;
    if (!active && !preview) throw new Error("Wallpaper unavailable.");
    return {
      store: next,
      data: {
        ok: true,
        id: request.wallpaperPath.split("/")[1].replace(/\.webp$/, ""),
      },
    };
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
      !sameTheme(proposal.theme, theme) ||
      (proposal.createdAt !== undefined &&
        proposal.createdAt < Date.now() - 86_400_000) ||
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

/** Bounded records share the existing private ai_quotas JSON column. */
export function themeQuota(
  value: number[] | ThemeQuota | undefined,
  now = Date.now(),
): ThemeQuota {
  const prior = Array.isArray(value)
    ? { attempts: value, successes: [] }
    : value;
  return {
    attempts: (prior?.attempts || [])
      .filter((t) => Number.isFinite(t) && t > now - 60_000)
      .slice(-10),
    successes: (prior?.successes || [])
      .filter(
        (t) =>
          typeof t.id === "string" &&
          Number.isFinite(t.at) &&
          t.at > now - 86_400_000,
      )
      .slice(-200),
    ...(prior?.pending && prior.pending.startedAt > now - 600_000
      ? { pending: prior.pending }
      : {}),
    ...(prior?.job && prior.job.createdAt > now - 86_400_000
      ? { job: structuredClone(prior.job) }
      : {}),
  };
}
export class ThemeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds?: number,
    readonly resetAt?: string,
  ) {
    super(message);
  }
}
function themeLimit(raw: string | undefined, fallback: number, max: number) {
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < 1 || value > max)
    throw new ThemeError(
      "The wallpaper generation limit needs correcting in the server settings.",
      503,
      "theme_configuration",
    );
  return value;
}
function reserveTheme(
  store: Store,
  identity: Identity,
  circleId: string,
  prompt: string,
): { store: Store; data: Result } {
  const now = Date.now();
  const quota = themeQuota(store.generations?.[identity.$id], now);
  const daily = themeLimit(process.env.THEME_DAILY_LIMIT, 50, 200),
    burst = themeLimit(process.env.THEME_BURST_LIMIT, 3, 10);
  if (
    quota.pending &&
    quota.job?.requestId === quota.pending.id &&
    quota.job.circleId === circleId &&
    quota.job.promptHash === themePromptHash(prompt) &&
    ["prepared", "processing"].includes(quota.job.status)
  )
    return { store, data: { ok: true, id: quota.pending.id } };
  if (quota.pending)
    throw new ThemeError(
      "A wallpaper is already being created. Let it finish before starting another.",
      429,
      "theme_in_progress",
      Math.max(1, Math.ceil((quota.pending.startedAt + 600_000 - now) / 1000)),
    );
  if (quota.successes.length >= daily) {
    const reset = Math.min(...quota.successes.map((t) => t.at)) + 86_400_000;
    throw new ThemeError(
      `You’ve generated ${daily} wallpapers in the last 24 hours. Your allowance resets as older wallpapers reach 24 hours.`,
      429,
      "theme_daily_limit",
      Math.max(1, Math.ceil((reset - now) / 1000)),
      new Date(reset).toISOString(),
    );
  }
  if (quota.attempts.length >= burst) {
    const seconds = Math.max(
      1,
      Math.ceil((Math.min(...quota.attempts) + 60_000 - now) / 1000),
    );
    throw new ThemeError(
      `Please wait ${seconds} seconds before creating another wallpaper.`,
      429,
      "theme_burst_limit",
      seconds,
    );
  }
  const id = randomUUID();
  quota.attempts.push(now);
  quota.pending = { id, circleId, startedAt: now };
  quota.job = {
    requestId: id,
    circleId,
    promptHash: themePromptHash(prompt),
    createdAt: now,
    status: "prepared",
  };
  store.generations ??= {};
  store.generations[identity.$id] = quota;
  return { store, data: { ok: true, id } };
}
/** Internal-only completion, committed after AI/storage work outside the DB transaction. */
export function recordTheme(
  store: Store,
  identity: Identity,
  circleId: string,
  theme: CircleTheme,
  requestId?: string,
): Store {
  const next = structuredClone(store);
  next.app.currentUserId = identity.$id;
  if (!isManager(next.app, circleId) || !validateTheme(theme))
    throw new ThemeError(
      "Your Circle access changed; the theme was not saved.",
      403,
      "theme_permission_changed",
    );
  const quota = themeQuota(next.generations?.[identity.$id]);
  const id = requestId || quota.pending?.id;
  const proposal = next.proposals?.[identity.$id];
  // An exact retry acknowledges a committed result, never a second paid request.
  if (
    id &&
    quota.successes.some((s) => s.id === id) &&
    proposal?.requestId === id &&
    sameTheme(proposal.theme, theme)
  )
    return next;
  if (
    !id ||
    quota.pending?.id !== id ||
    quota.pending.circleId !== circleId ||
    theme.source !== "ai" ||
    theme.wallpaperPath !== `${circleId}/${id}.webp`
  )
    throw new ThemeError(
      "Wallpaper request unavailable or expired. Generate a fresh preview.",
      400,
      "theme_request_unavailable",
    );
  const now = Date.now();
  quota.successes.push({ id, at: now });
  delete quota.pending;
  if (quota.job?.requestId === id) quota.job.status = "completed";
  next.generations ??= {};
  next.generations[identity.$id] = quota;
  next.proposals ??= {};
  next.proposals[identity.$id] = {
    circleId,
    theme,
    createdAt: now,
    requestId: id,
  };
  next.app.currentUserId = null;
  return next;
}
export function failTheme(
  store: Store,
  identity: Identity,
  requestId: string,
  failure?: ThemeFailure,
  retainPending = false,
): Store {
  const next = structuredClone(store),
    quota = themeQuota(next.generations?.[identity.$id]);
  if (!retainPending && quota.pending?.id === requestId) delete quota.pending;
  if (quota.job?.requestId === requestId && quota.job.status !== "completed") {
    quota.job.status = "failed";
    quota.job.failure = failure || {
      error: "The wallpaper could not be created. Please try again.",
      code: "theme_generation_failed",
      responseStatus: 502,
    };
  }
  next.generations ??= {};
  next.generations[identity.$id] = quota;
  return next;
}
function themePromptHash(prompt: string): string {
  return createHash("sha256").update(prompt.trim()).digest("hex");
}
function unavailableTheme(): ThemeError {
  return new ThemeError(
    "This wallpaper request is unavailable, expired, or replaced by a newer request. Generate a fresh preview.",
    410,
    "theme_request_unavailable",
  );
}
export function sameTheme(first: CircleTheme, second: CircleTheme): boolean {
  return (
    Object.keys(first).length === Object.keys(second).length &&
    Object.keys(first).every(
      (key) =>
        first[key as keyof CircleTheme] === second[key as keyof CircleTheme],
    )
  );
}
/** Used only on a fresh privileged server load, never on untrusted client data. */
export function hasThemeCompletion(
  store: Store,
  identity: Identity,
  requestId: string,
  theme: CircleTheme,
): boolean {
  const proposal = store.proposals?.[identity.$id];
  return Boolean(
    proposal?.requestId === requestId &&
    sameTheme(proposal.theme, theme) &&
    themeQuota(store.generations?.[identity.$id]).successes.some(
      (s) => s.id === requestId,
    ),
  );
}
