import { AppState } from "../types";

const BUNDLED_PREFIX = "circle-bundled:";
const ARRAY_KEYS = [
  "users",
  "circles",
  "members",
  "requests",
  "invitations",
  "posts",
  "comments",
  "messages",
  "notifications",
  "blocks",
  "reports",
] as const;

export function mapDemoImages(
  state: AppState,
  map: (uri: string) => string,
): AppState {
  return {
    ...state,
    users: state.users.map((user) => ({ ...user, avatar: map(user.avatar) })),
    circles: state.circles.map((circle) => ({
      ...circle,
      avatar: map(circle.avatar),
      cover: map(circle.cover),
    })),
    posts: state.posts.map((post) => ({
      ...post,
      media: post.media ? map(post.media) : post.media,
    })),
  };
}

/** Store bundled image identifiers, rather than a Metro host or build-specific URL. */
export function serializeDemoState(
  state: AppState,
  assets: Record<string, string>,
  serializeMedia: (uri: string) => string = (uri) => uri,
): string {
  const reverse = new Map(
    Object.entries(assets).map(([name, uri]) => [uri, name]),
  );
  return JSON.stringify(
    mapDemoImages(state, (uri) => {
      const key = reverse.get(uri);
      return key ? `${BUNDLED_PREFIX}${key}` : serializeMedia(uri);
    }),
  );
}

/** Restore identifiers against this build's asset locations, preserving user media. */
export function restoreDemoState(
  raw: string,
  assets: Record<string, string>,
  resolveMedia: (uri: string) => string = (uri) => uri,
): AppState {
  const saved: unknown = JSON.parse(raw);
  if (!saved || typeof saved !== "object")
    throw new Error("Invalid saved demo.");
  const candidate = saved as Partial<AppState>;
  if (
    candidate.version !== 1 ||
    !ARRAY_KEYS.every((key) => Array.isArray(candidate[key])) ||
    !(
      candidate.currentUserId === null ||
      typeof candidate.currentUserId === "string"
    )
  )
    throw new Error("Invalid saved demo.");
  return mapDemoImages(candidate as AppState, (uri) => {
    if (!uri) return uri;
    if (uri.startsWith(BUNDLED_PREFIX))
      return assets[uri.slice(BUNDLED_PREFIX.length)] || "";
    // Migrate v1 snapshots saved before stable identifiers were introduced. Only
    // Metro/export asset paths qualify; ordinary user-hosted images stay intact.
    if (!/(?:\/assets\/|asset:\/)/.test(uri)) return resolveMedia(uri);
    let path = uri;
    try {
      path = decodeURIComponent(uri);
    } catch {
      /* Keep the original URI when malformed. */
    }
    const name = Object.keys(assets).find((key) =>
      new RegExp(
        `(?:^|/|=)${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[._-][a-f0-9]{6,})?\\.(?:jpg|jpeg|png)(?:$|[?&#])`,
        "i",
      ).test(path),
    );
    return name ? assets[name] : uri;
  });
}
