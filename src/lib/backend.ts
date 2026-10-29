import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { requireSupabase } from "./supabase";
import {
  MEDIA_MAX_BYTES,
  PHOTO_JPEG_QUALITY,
  photoResize,
  validateMedia,
} from "./media";

export type CircleRole = "owner" | "admin" | "moderator" | "member";
export type CircleCategory =
  "Family" | "Friends" | "School" | "Community" | "Hobby" | "Other";
export interface CreateCircleInput {
  name: string;
  description?: string;
  category?: CircleCategory;
  discoverable?: boolean;
  approvalRequired?: boolean;
  avatarUrl?: string | null;
  coverUrl?: string | null;
}

async function userId() {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Please sign in.");
  return data.user.id;
}

// Preserve Supabase's structured errors instead of returning a false success.
async function rpc(name: string, args?: Record<string, unknown>) {
  const { data, error } = await requireSupabase().rpc(name, args);
  if (error) throw error;
  return data;
}

export const backend = {
  async signUp(
    email: string,
    password: string,
    name: string,
    username: string,
  ) {
    if (password.length < 8)
      throw new Error("Use at least 8 characters for your password.");
    if (!/^[a-z0-9_]{3,30}$/.test(username))
      throw new Error(
        "Username must be 3–30 lowercase letters, numbers, or underscores.",
      );
    const { data, error } = await requireSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim(), username, adult_confirmed: true } },
    });
    if (error) throw error;
    return data;
  },
  async signIn(email: string, password: string) {
    const { data, error } = await requireSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    return data;
  },
  async signOut() {
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw error;
  },
  async getProfile() {
    const { data, error } = await requireSupabase()
      .from("profiles")
      .select("*")
      .eq("id", await userId())
      .single();
    if (error) throw error;
    return data;
  },
  async updateProfile(profile: {
    name?: string;
    username?: string;
    avatar_url?: string | null;
    bio?: string;
  }) {
    const { data, error } = await requireSupabase()
      .from("profiles")
      .update(profile)
      .eq("id", await userId())
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async listCircles() {
    const client = requireSupabase();
    const { data: memberships, error: memberError } = await client
      .from("circle_members")
      .select("circle_id,role")
      .eq("user_id", await userId());
    if (memberError) throw memberError;
    if (!memberships?.length) return [];
    const { data, error } = await client
      .from("circles")
      .select("*")
      .in(
        "id",
        memberships.map((m) => m.circle_id),
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((circle) => ({
      ...circle,
      role: memberships.find((m) => m.circle_id === circle.id)?.role,
    }));
  },
  async discoverCircles() {
    const { data, error } = await requireSupabase()
      .from("circles")
      .select("*")
      .eq("discoverable", true)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  },
  createCircle(input: CreateCircleInput) {
    return rpc("create_circle", {
      p_name: input.name,
      p_description: input.description ?? "",
      p_category: input.category ?? "Other",
      p_discoverable: input.discoverable ?? false,
      p_approval_required: input.approvalRequired ?? true,
      p_avatar_url: input.avatarUrl ?? null,
      p_cover_url: input.coverUrl ?? null,
    });
  },
  async updateCircle(
    circleId: string,
    updates: {
      name?: string;
      description?: string;
      category?: CircleCategory;
      discoverable?: boolean;
      approval_required?: boolean;
      avatar_url?: string | null;
      cover_url?: string | null;
    },
  ) {
    const { data, error } = await requireSupabase()
      .from("circles")
      .update(updates)
      .eq("id", circleId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  requestJoin: (circleId: string) =>
    rpc("request_join", { p_circle: circleId }),
  async pendingRequests(circleId?: string) {
    let query = requireSupabase()
      .from("circle_join_requests")
      .select("*,profiles!user_id(id,name,username,avatar_url)")
      .order("created_at", { ascending: false });
    if (circleId) query = query.eq("circle_id", circleId);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },
  reviewJoin: (requestId: string, approve: boolean) =>
    rpc("review_join_request", { p_request: requestId, p_approve: approve }),
  createInvitation: (circleId: string, email?: string) =>
    rpc("create_invitation", {
      p_circle: circleId,
      p_email: email || null,
    }) as Promise<string>,
  acceptInvitation: (token: string) =>
    rpc("accept_invitation", { p_token: token }) as Promise<string>,
  async listMembers(circleId: string) {
    const { data, error } = await requireSupabase()
      .from("circle_members")
      .select("*,profiles(id,name,username,avatar_url)")
      .eq("circle_id", circleId)
      .order("joined_at");
    if (error) throw error;
    return data ?? [];
  },
  setMemberRole: (
    circleId: string,
    memberId: string,
    role: Exclude<CircleRole, "owner">,
  ) =>
    rpc("change_member_role", {
      p_circle: circleId,
      p_user: memberId,
      p_role: role,
    }),
  removeMember: (circleId: string, memberId: string) =>
    rpc("remove_circle_member", { p_circle: circleId, p_user: memberId }),
  async leaveCircle(circleId: string) {
    await rpc("remove_circle_member", {
      p_circle: circleId,
      p_user: await userId(),
    });
  },
  transferOwnership: (circleId: string, memberId: string) =>
    rpc("transfer_circle_ownership", { p_circle: circleId, p_user: memberId }),
  deleteCircle: (circleId: string) =>
    rpc("delete_circle", { p_circle: circleId }),
  async listPosts(circleId?: string) {
    let query = requireSupabase()
      .from("posts")
      .select(
        "*,profiles!author_id(id,name,username,avatar_url),post_media(*),post_reactions(*)",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (circleId) query = query.eq("circle_id", circleId);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },
  async createPost(
    circleId: string,
    body: string,
    media: { path: string; type: "image" | "video" }[] = [],
  ) {
    if (!body.trim() && !media.length)
      throw new Error("Add a message, photo, or video.");
    if (media.length > 4)
      throw new Error("You can attach up to four photos or videos.");
    // Atomic RPC creates post+media together, avoiding half-completed posts.
    return rpc("create_post", {
      p_circle: circleId,
      p_body: body.trim(),
      p_media: media.map((m) => ({ storage_path: m.path, media_type: m.type })),
    });
  },
  async deletePost(postId: string) {
    const { data, error } = await requireSupabase()
      .from("posts")
      .delete()
      .eq("id", postId)
      .select("id");
    if (error) throw error;
    if (!data?.length)
      throw new Error(
        "Content unavailable or you do not have permission to delete it.",
      );
  },
  async react(
    postId: string,
    active: boolean,
    reaction: "heart" | "celebrate" | "support" = "heart",
  ) {
    const client = requireSupabase();
    const uid = await userId();
    const { error } = active
      ? await client
          .from("post_reactions")
          .insert({ post_id: postId, user_id: uid, reaction })
      : await client
          .from("post_reactions")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", uid);
    if (error && error.code !== "23505") throw error;
  },
  async listComments(postId: string) {
    const { data, error } = await requireSupabase()
      .from("comments")
      .select("*,profiles!author_id(id,name,username,avatar_url)")
      .eq("post_id", postId)
      .order("created_at");
    if (error) throw error;
    return data ?? [];
  },
  async addComment(postId: string, body: string, parentId?: string) {
    const { data, error } = await requireSupabase()
      .from("comments")
      .insert({
        post_id: postId,
        author_id: await userId(),
        body: body.trim(),
        parent_id: parentId ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async deleteComment(commentId: string) {
    const { data, error } = await requireSupabase()
      .from("comments")
      .delete()
      .eq("id", commentId)
      .select("id");
    if (error) throw error;
    if (!data?.length)
      throw new Error(
        "Content unavailable or you do not have permission to delete it.",
      );
  },
  async listMessages(circleId: string) {
    const { data, error } = await requireSupabase()
      .from("circle_messages")
      .select("*,profiles!author_id(id,name,username,avatar_url)")
      .eq("circle_id", circleId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []).reverse();
  },
  async sendMessage(circleId: string, body: string) {
    const { data, error } = await requireSupabase()
      .from("circle_messages")
      .insert({
        circle_id: circleId,
        author_id: await userId(),
        body: body.trim(),
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async deleteMessage(messageId: string) {
    const { data, error } = await requireSupabase()
      .from("circle_messages")
      .delete()
      .eq("id", messageId)
      .select("id");
    if (error) throw error;
    if (!data?.length)
      throw new Error(
        "Content unavailable or you do not have permission to delete it.",
      );
  },
  async listNotifications() {
    const { data, error } = await requireSupabase()
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  },
  async markNotificationsRead() {
    const { error } = await requireSupabase()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", await userId())
      .is("read_at", null);
    if (error) throw error;
  },
  async report(
    circleId: string,
    reason: string,
    content: { postId?: string; messageId?: string; commentId?: string },
  ) {
    const { error } = await requireSupabase()
      .from("reports")
      .insert({
        circle_id: circleId,
        reporter_id: await userId(),
        reason: reason.trim(),
        post_id: content.postId ?? null,
        message_id: content.messageId ?? null,
        comment_id: content.commentId ?? null,
      });
    if (error) throw error;
  },
  async blockUser(blockedId: string) {
    const { error } = await requireSupabase()
      .from("user_blocks")
      .insert({ blocked_id: blockedId, blocker_id: await userId() });
    if (error && error.code !== "23505") throw error;
  },
  async unblockUser(blockedId: string) {
    const { error } = await requireSupabase()
      .from("user_blocks")
      .delete()
      .eq("blocked_id", blockedId)
      .eq("blocker_id", await userId());
    if (error) throw error;
  },
  async uploadMedia(
    circleId: string,
    uri: string,
    type: "image" | "video",
    durationMs?: number,
  ): Promise<{ path: string; type: "image" | "video" }> {
    let uploadUri = uri;
    let contentType = "video/mp4";
    if (type === "image") {
      // Decoding/re-encoding removes source EXIF/GPS. Never upload originals.
      const context = ImageManipulator.manipulate(uri);
      const original = await context.renderAsync();
      const resize = photoResize(original.width, original.height);
      if (resize) context.resize(resize);
      const rendered = resize ? await context.renderAsync() : original;
      const image = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: PHOTO_JPEG_QUALITY,
      });
      uploadUri = image.uri;
      contentType = "image/jpeg";
    } else {
      const error = validateMedia({ type, durationMs });
      if (error) throw new Error(error);
    }
    const response = await fetch(uploadUri);
    if (!response.ok)
      throw new Error(
        "This media file could not be read. Please select it again.",
      );
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MEDIA_MAX_BYTES)
      throw new Error("Media must be under 50 MB.");
    if (type === "video") {
      const mime = response.headers
        .get("content-type")
        ?.split(";")[0]
        .toLowerCase();
      if (mime && mime !== "application/octet-stream") {
        const error = validateMedia({ type, durationMs, mimeType: mime });
        if (error) throw new Error(error);
      }
      contentType =
        mime === "video/quicktime" || /\.mov(?:[?#]|$)/i.test(uri)
          ? "video/quicktime"
          : "video/mp4";
    }
    const extension =
      type === "image"
        ? "jpg"
        : contentType === "video/quicktime"
          ? "mov"
          : "mp4";
    const path = `${circleId}/${await userId()}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const { error } = await requireSupabase()
      .storage.from("circle-media")
      .upload(path, bytes, { contentType, upsert: false });
    if (error) throw error;
    return { path, type };
  },
  async signedMediaUrl(path: string, seconds = 60) {
    const { data, error } = await requireSupabase()
      .storage.from("circle-media")
      .createSignedUrl(path, Math.max(1, Math.min(60, seconds)));
    if (error) throw error;
    return data.signedUrl;
  },
  async uploadAvatar(uri: string): Promise<string> {
    const context = ImageManipulator.manipulate(uri);
    context.resize({ width: 512 });
    const image = await (
      await context.renderAsync()
    ).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    const bytes = await (await fetch(image.uri)).arrayBuffer();
    if (bytes.byteLength > 5 * 1024 * 1024)
      throw new Error("Profile photo must be under 5 MB.");
    const path = `${await userId()}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const { error } = await requireSupabase()
      .storage.from("profile-avatars")
      .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
    return path;
  },
  async signedAvatarUrl(path: string) {
    const { data, error } = await requireSupabase()
      .storage.from("profile-avatars")
      .createSignedUrl(path, 60);
    if (error) throw error;
    return data.signedUrl;
  },
  async deleteAccount() {
    const { data, error } = await requireSupabase().functions.invoke(
      "delete-account",
      { body: {} },
    );
    if (error)
      throw new Error(
        "Account deletion could not finish. Ensure the delete-account Edge Function is deployed, then retry.",
      );
    if (!data?.deleted)
      throw new Error(data?.error || "Account deletion was not confirmed.");
    await requireSupabase().auth.signOut({ scope: "local" });
  },
  subscribeToCircle(circleId: string, onChange: () => void) {
    const client = requireSupabase();
    const channel = client
      .channel(`circle:${circleId}:${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "circle_messages",
          filter: `circle_id=eq.${circleId}`,
        },
        onChange,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "posts",
          filter: `circle_id=eq.${circleId}`,
        },
        onChange,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "circle_members",
          filter: `circle_id=eq.${circleId}`,
        },
        onChange,
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  },
};
