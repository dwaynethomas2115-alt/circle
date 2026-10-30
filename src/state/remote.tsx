import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState as NativeAppState } from "react-native";
import { supabase } from "../lib/supabase";
import { backend } from "../lib/backend";
import type {
  AppState,
  Category,
  CreateCircleInput,
  CreatePostInput,
  Profile,
  Result,
  Role,
} from "../types";
import type { CircleContextValue } from "./types";

const empty = (): AppState => ({
  version: 1,
  currentUserId: null,
  users: [],
  circles: [],
  members: [],
  requests: [],
  invitations: [],
  posts: [],
  comments: [],
  messages: [],
  notifications: [],
  blocks: [],
  reports: [],
  theme: "light",
});
type Row = Record<string, any>; // Supabase runtime rows; generated DB types can replace this after project configuration.
const profile = (p: Row): Profile => ({
  id: p.id,
  name: p.name,
  username: p.username,
  avatar: p.avatar_url || "",
  bio: p.bio || "",
});
const isLocalImage = (uri?: string) =>
  !!uri && /^(file:|blob:|data:|content:|ph:|assets-library:)/.test(uri);
const isStoragePath = (uri?: string) => !!uri && /^[0-9a-f-]{36}\//i.test(uri);
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : (error as { message?: string })?.message ||
      "Circle could not connect. Please try again.";

/** Real backend mode. Never mixes sample data with authenticated remote data. */
export function useRemoteCircle(): CircleContextValue {
  const [state, setState] = useState<AppState>(empty);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = useRef<string | null>(null);
  const generation = useRef(0);
  const alive = useRef(true);
  const profilePaths = useRef(new Map<string, string>());
  const circlePaths = useRef(
    new Map<string, { avatar: string | null; cover: string | null }>(),
  );

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const token = ++generation.current;
    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const id = sessionData.session?.user.id ?? null;
      if (userId.current !== id) {
        userId.current = id;
        profilePaths.current.clear();
        circlePaths.current.clear();
        setState({ ...empty(), currentUserId: id });
      }
      if (!id) {
        setState(empty());
        setError(null);
        return;
      }
      const read = async (table: string, order?: string): Promise<Row[]> => {
        let query = supabase!.from(table).select("*");
        if (order) query = query.order(order, { ascending: false });
        const response = await query;
        if (response.error) throw response.error;
        return response.data || [];
      };
      // Refresh membership first. Drop revoked content before hydrating anything else.
      const ownResponse = await supabase
        .from("circle_members")
        .select("*")
        .eq("user_id", id);
      if (ownResponse.error) throw ownResponse.error;
      const ownMemberships: Row[] = ownResponse.data || [];
      const members: Row[] = [...ownMemberships];
      if (token !== generation.current || !alive.current) return;
      const allowed = new Set(
        members.filter((m) => m.user_id === id).map((m) => m.circle_id),
      );
      setState((previous) => {
        const postIds = new Set(
          previous.posts
            .filter((p) => allowed.has(p.circleId))
            .map((p) => p.id),
        );
        return {
          ...previous,
          circles: previous.circles.filter(
            (c) => allowed.has(c.id) || c.discoverable,
          ),
          reports: previous.reports.filter(
            (r) => !r.circleId || allowed.has(r.circleId),
          ),
          requests: previous.requests.filter(
            (r) => r.userId === id || allowed.has(r.circleId),
          ),
          notifications: previous.notifications.filter(
            (n) => !n.circleId || allowed.has(n.circleId),
          ),
          posts: previous.posts.filter((p) => allowed.has(p.circleId)),
          comments: previous.comments.filter((c) => postIds.has(c.postId)),
          messages: previous.messages.filter((m) => allowed.has(m.circleId)),
          members: members.map((m) => ({
            circleId: m.circle_id,
            userId: m.user_id,
            role: m.role as Role,
            joinedAt: m.joined_at,
          })),
        };
      });
      const [
        circles,
        posts,
        media,
        comments,
        reactions,
        messages,
        notices,
        requests,
        blocks,
        allMembers,
        reports,
      ] = await Promise.all([
        read("circles", "created_at"),
        read("posts", "created_at"),
        read("post_media"),
        read("comments", "created_at"),
        read("post_reactions"),
        read("circle_messages", "created_at"),
        read("notifications", "created_at"),
        read("circle_join_requests", "created_at"),
        read("user_blocks"),
        read("circle_members"),
        read("reports"),
      ]);
      for (const member of allMembers)
        if (
          !members.some(
            (m) =>
              m.user_id === member.user_id && m.circle_id === member.circle_id,
          )
        )
          members.push(member);
      const authorizedPosts = posts.filter((p) => allowed.has(p.circle_id));
      const postIds = new Set(authorizedPosts.map((p) => p.id));
      const mediaUrls = new Map<string, string>();
      await Promise.all(
        media
          .filter((m) => postIds.has(m.post_id))
          .map(async (m) => {
            const url = await backend.signedMediaUrl(m.storage_path);
            mediaUrls.set(m.post_id, url);
          }),
      );
      const relevantUsers = new Set([
        id,
        ...members.map((m) => m.user_id),
        ...requests.map((r) => r.user_id),
        ...authorizedPosts.map((p) => p.author_id),
        ...comments
          .filter((c) => postIds.has(c.post_id))
          .map((c) => c.author_id),
        ...messages
          .filter((m) => allowed.has(m.circle_id))
          .map((m) => m.author_id),
      ]);
      const profileResponse = await supabase
        .from("profiles")
        .select("*")
        .in("id", [...relevantUsers]);
      if (profileResponse.error) throw profileResponse.error;
      const profiles: Row[] = profileResponse.data || [];
      const signedProfiles = new Map<string, string>();
      const signedCircleAvatars = new Map<string, string>();
      const signedCircleCovers = new Map<string, string>();
      await Promise.all([
        ...profiles
          .filter((p) => isStoragePath(p.avatar_url))
          .map(async (p) => {
            profilePaths.current.set(p.id, p.avatar_url);
            signedProfiles.set(
              p.id,
              await backend.signedAvatarUrl(p.avatar_url),
            );
          }),
        ...circles
          .filter((c) => allowed.has(c.id))
          .map(async (c) => {
            circlePaths.current.set(c.id, {
              avatar: c.avatar_url,
              cover: c.cover_url,
            });
            if (isStoragePath(c.avatar_url))
              signedCircleAvatars.set(
                c.id,
                await backend.signedMediaUrl(c.avatar_url),
              );
            if (isStoragePath(c.cover_url))
              signedCircleCovers.set(
                c.id,
                await backend.signedMediaUrl(c.cover_url),
              );
          }),
      ]);
      if (token !== generation.current || !alive.current) return;
      setState((previous) => ({
        ...empty(),
        theme: previous.theme,
        currentUserId: id,
        users: profiles
          .filter((p) => relevantUsers.has(p.id))
          .map((p) => ({
            ...profile(p),
            ...(p.id === id ? { email: sessionData.session?.user.email } : {}),
            avatar:
              signedProfiles.get(p.id) ||
              (isStoragePath(p.avatar_url) ? "" : p.avatar_url || ""),
          })),
        circles: circles.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          category: c.category as Category,
          avatar:
            signedCircleAvatars.get(c.id) ||
            (isStoragePath(c.avatar_url) ? "" : c.avatar_url || ""),
          cover:
            signedCircleCovers.get(c.id) ||
            (isStoragePath(c.cover_url) ? "" : c.cover_url || ""),
          color: "#e4f0ed",
          discoverable: c.discoverable,
          approvalRequired: c.approval_required,
          ownerId: c.owner_id,
          createdAt: c.created_at,
        })),
        members: members.map((m) => ({
          circleId: m.circle_id,
          userId: m.user_id,
          role: m.role as Role,
          joinedAt: m.joined_at,
        })),
        requests: requests.map((r) => ({
          id: r.id,
          circleId: r.circle_id,
          userId: r.user_id,
          status: r.status,
          createdAt: r.created_at,
        })),
        posts: authorizedPosts.map((p) => {
          const item = media.find((m) => m.post_id === p.id);
          return {
            id: p.id,
            circleId: p.circle_id,
            authorId: p.author_id,
            content: p.body,
            createdAt: p.created_at,
            media: mediaUrls.get(p.id),
            mediaType: item?.media_type,
            reactions: reactions
              .filter((r) => r.post_id === p.id)
              .map((r) => r.user_id),
          };
        }),
        comments: comments
          .filter((c) => postIds.has(c.post_id))
          .map((c) => ({
            id: c.id,
            postId: c.post_id,
            authorId: c.author_id,
            content: c.body,
            parentId: c.parent_id || undefined,
            createdAt: c.created_at,
          })),
        messages: messages
          .filter((m) => allowed.has(m.circle_id))
          .map((m) => ({
            id: m.id,
            circleId: m.circle_id,
            authorId: m.author_id,
            content: m.body,
            createdAt: m.created_at,
          }))
          .reverse(),
        notifications: notices.map((n) => ({
          id: n.id,
          userId: n.user_id,
          title: n.title,
          body: "",
          type: n.kind === "reply" ? "comment" : n.kind,
          circleId: n.circle_id || undefined,
          postId: n.post_id || undefined,
          read: !!n.read_at,
          createdAt: n.created_at,
        })),
        blocks: blocks.map((b) => ({
          userId: b.blocker_id,
          blockedId: b.blocked_id,
        })),
        reports: reports.map((r) => ({
          id: r.id,
          circleId: r.circle_id,
          userId: r.reporter_id,
          targetType: r.comment_id
            ? "comment"
            : r.message_id
              ? "message"
              : "post",
          targetId: r.comment_id || r.message_id || r.post_id,
          reason: r.reason,
          createdAt: r.created_at,
        })),
      }));
      setError(null);
    } catch (cause) {
      if (token === generation.current && alive.current) {
        // Fail closed: a failed refresh must not preserve private content indefinitely.
        setState((previous) => ({
          ...empty(),
          currentUserId: userId.current,
          users: previous.users.filter((p) => p.id === userId.current),
        }));
        setError(errorText(cause));
      }
    } finally {
      if (token === generation.current && alive.current) setReady(true);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const auth = supabase?.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== userId.current) {
        ++generation.current;
        userId.current = session?.user.id ?? null;
        profilePaths.current.clear();
        circlePaths.current.clear();
        setState(empty());
      }
      // Defer out of the auth callback to avoid Supabase auth-lock reentrancy.
      setTimeout(() => {
        if (alive.current) void refresh();
      }, 0);
    });
    const channel = supabase
      ?.channel("circle-authorized-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "circle_members" },
        (event) => {
          // Inserts and role changes do not revoke this caller. Clearing every
          // membership on those events would tear down an active group room.
          // A DELETE can revoke access, so clear before the authoritative reload.
          const oldUser = (event.old as { user_id?: string }).user_id;
          if (
            event.eventType === "DELETE" &&
            (!oldUser || oldUser === userId.current)
          ) {
            setState((previous) => ({
              ...previous,
              circles: previous.circles.filter((c) => c.discoverable),
              posts: [],
              comments: [],
              messages: [],
              members: [],
              reports: [],
              notifications: [],
              requests: previous.requests.filter(
                (r) => r.userId === previous.currentUserId,
              ),
            }));
          }
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "circle_messages" },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts" },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments" },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_reactions" },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    const listener = NativeAppState.addEventListener("change", (value) => {
      if (value === "active") void refresh();
    });
    // Revalidate authorization even when an RLS-filtered delete event cannot be delivered.
    // This also renews short-lived media URLs. Existing URLs expire within 60 seconds.
    const timer = setInterval(() => {
      if (userId.current) void refresh();
    }, 30_000);
    return () => {
      alive.current = false;
      // This ref counts requests; invalidate in-flight reads when unmounting.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++generation.current;
      clearInterval(timer);
      listener.remove();
      auth?.data.subscription.unsubscribe();
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const run = useCallback(
    async (operation: () => Promise<unknown>): Promise<Result> => {
      try {
        const result = await operation();
        await refresh();
        return {
          ok: true,
          ...(typeof result === "string" ? { id: result } : {}),
        };
      } catch (cause) {
        await refresh();
        return { ok: false, error: errorText(cause) };
      }
    },
    [refresh],
  );

  const actions = useMemo(
    () => ({
      signIn: (email: string, _name?: string, password?: string) =>
        run(async () => {
          if (!password) throw new Error("Enter your password to sign in.");
          await backend.signIn(email.trim(), password);
        }),
      signUp: async (
        name: string,
        username: string,
        email: string,
        adult: boolean,
        password?: string,
      ): Promise<Result> => {
        try {
          if (!adult)
            throw new Error("Circle accounts are for adults 18 and older.");
          if (!password || password.length < 8)
            throw new Error("Choose a password with at least 8 characters.");
          const auth = await backend.signUp(
            email.trim(),
            password,
            name.trim(),
            username.trim().toLowerCase(),
          );
          await refresh();
          return {
            ok: true,
            ...(auth.session ? {} : { code: "confirm_email" }),
          };
        } catch (cause) {
          return { ok: false, error: errorText(cause) };
        }
      },
      signOut: () =>
        run(async () => {
          ++generation.current;
          setState(empty());
          await backend.signOut();
        }),
      deleteAccount: () =>
        run(async () => {
          await backend.deleteAccount();
          ++generation.current;
          setState(empty());
        }),
      resetDemo: (): Promise<Result> =>
        Promise.resolve({
          ok: false,
          error: "Reset demo is only available in local demo mode.",
        }),
      updateProfile: (updates: Partial<Profile>) =>
        run(async () => {
          const current = state.users.find((p) => p.id === state.currentUserId);
          let avatar = updates.avatar;
          if (avatar && avatar === current?.avatar)
            avatar =
              profilePaths.current.get(state.currentUserId || "") || avatar;
          else if (isLocalImage(avatar))
            avatar = await backend.uploadAvatar(avatar!);
          await backend.updateProfile({
            name: updates.name,
            username: updates.username,
            bio: updates.bio,
            avatar_url: avatar,
          });
        }),
      createCircle: (input: CreateCircleInput) =>
        run(async () => {
          const localAvatar = isLocalImage(input.avatar),
            localCover = isLocalImage(input.cover);
          const circle = await backend.createCircle({
            name: input.name,
            description: input.description,
            category: input.category,
            discoverable: input.discoverable,
            approvalRequired: input.approvalRequired ?? true,
            avatarUrl: localAvatar ? null : input.avatar,
            coverUrl: localCover ? null : input.cover,
          });
          if (localAvatar || localCover) {
            const uploaded: string[] = [];
            try {
              let avatar = input.avatar,
                cover = input.cover;
              if (localAvatar) {
                avatar = (
                  await backend.uploadMedia(circle.id, input.avatar!, "image")
                ).path;
                uploaded.push(avatar);
              }
              if (localCover) {
                cover = (
                  await backend.uploadMedia(circle.id, input.cover!, "image")
                ).path;
                uploaded.push(cover);
              }
              await backend.updateCircle(circle.id, {
                avatar_url: avatar,
                cover_url: cover,
              });
            } catch (cause) {
              if (uploaded.length)
                await supabase?.storage.from("circle-media").remove(uploaded);
              await backend.deleteCircle(circle.id);
              throw cause;
            }
          }
          return circle.id;
        }),
      updateCircle: (circleId: string, patch: Partial<CreateCircleInput>) =>
        run(async () => {
          const current = state.circles.find((c) => c.id === circleId);
          let avatar = patch.avatar,
            cover = patch.cover;
          if (avatar && avatar === current?.avatar)
            avatar = circlePaths.current.get(circleId)?.avatar || avatar;
          else if (isLocalImage(avatar))
            avatar = (await backend.uploadMedia(circleId, avatar!, "image"))
              .path;
          if (cover && cover === current?.cover)
            cover = circlePaths.current.get(circleId)?.cover || cover;
          else if (isLocalImage(cover))
            cover = (await backend.uploadMedia(circleId, cover!, "image")).path;
          return backend.updateCircle(circleId, {
            name: patch.name,
            description: patch.description,
            category: patch.category,
            discoverable: patch.discoverable,
            approval_required: patch.approvalRequired,
            avatar_url: avatar,
            cover_url: cover,
          });
        }),
      requestJoin: async (circleId: string): Promise<Result> => {
        let status: string | undefined;
        const result = await run(async () => {
          const request = await backend.requestJoin(circleId);
          status = request.status;
        });
        return result.ok
          ? { ...result, code: status === "approved" ? "joined" : "pending" }
          : result;
      },
      respondRequest: (requestId: string, approve: boolean) =>
        run(() => backend.reviewJoin(requestId, approve)),
      createInvitation: async (circleId: string): Promise<Result> => {
        try {
          const code = await backend.createInvitation(circleId);
          return { ok: true, code };
        } catch (cause) {
          return { ok: false, error: errorText(cause) };
        }
      },
      redeemInvitation: (code: string) =>
        run(() => backend.acceptInvitation(code.trim())),
      leaveCircle: (circleId: string) =>
        run(() => backend.leaveCircle(circleId)),
      removeMember: (circleId: string, id: string) =>
        run(() => backend.removeMember(circleId, id)),
      setRole: (circleId: string, id: string, role: Role) =>
        run(async () => {
          if (role === "owner") await backend.transferOwnership(circleId, id);
          else await backend.setMemberRole(circleId, id, role);
        }),
      createPost: (input: CreatePostInput) =>
        run(async () => {
          const attachment = input.media
            ? await backend.uploadMedia(
                input.circleId,
                input.media,
                input.mediaType || "image",
                input.mediaDurationMs,
                {
                  mimeType: input.mediaMimeType,
                  onProgress: input.onUploadProgress,
                  signal: input.uploadSignal,
                },
              )
            : undefined;
          try {
            if (input.uploadSignal?.aborted)
              throw new Error("Upload canceled. Your draft is still here.");
            const post = await backend.createPost(
              input.circleId,
              input.content,
              attachment ? [attachment] : [],
            );
            return post.id;
          } catch (cause) {
            // Completed media must not become orphaned when post creation fails.
            if (attachment)
              await supabase?.storage
                .from("circle-media")
                .remove([attachment.path]);
            throw cause;
          }
        }),
      deletePost: (postId: string) => run(() => backend.deletePost(postId)),
      toggleReaction: (postId: string) =>
        run(() =>
          backend.react(
            postId,
            !state.posts
              .find((p) => p.id === postId)
              ?.reactions.includes(state.currentUserId || ""),
          ),
        ),
      addComment: (postId: string, content: string, parentId?: string) =>
        run(() => backend.addComment(postId, content, parentId)),
      deleteComment: (id: string) => run(() => backend.deleteComment(id)),
      sendMessage: (circleId: string, content: string) =>
        run(() => backend.sendMessage(circleId, content)),
      deleteMessage: (id: string) => run(() => backend.deleteMessage(id)),
      markRead: (_id?: string) => run(() => backend.markNotificationsRead()),
      report: (
        targetType: "post" | "comment" | "message",
        targetId: string,
        reason: string,
      ) =>
        run(async () => {
          if (targetType === "comment") {
            const comment = state.comments.find((c) => c.id === targetId);
            if (!comment) throw new Error("Comment unavailable.");
            const post = state.posts.find((p) => p.id === comment.postId);
            if (!post) throw new Error("Post unavailable.");
            await backend.report(post.circleId, reason, {
              commentId: comment.id,
            });
          } else {
            const item =
              targetType === "post"
                ? state.posts.find((p) => p.id === targetId)
                : state.messages.find((m) => m.id === targetId);
            if (!item) throw new Error("Content unavailable.");
            await backend.report(
              item.circleId,
              reason,
              targetType === "post"
                ? { postId: targetId }
                : { messageId: targetId },
            );
          }
        }),
      blockUser: (id: string) => run(() => backend.blockUser(id)),
      setTheme: (theme: AppState["theme"]): Promise<Result> => {
        setState((previous) => ({ ...previous, theme }));
        return Promise.resolve({ ok: true });
      },
    }),
    [
      run,
      refresh,
      state.comments,
      state.posts,
      state.messages,
      state.currentUserId,
      state.users,
      state.circles,
    ],
  );

  const user = state.users.find((p) => p.id === state.currentUserId) || null;
  const joinedCircles = state.circles.filter((c) =>
    state.members.some(
      (m) => m.circleId === c.id && m.userId === state.currentUserId,
    ),
  );
  const joined = new Set(joinedCircles.map((c) => c.id));
  const feed = state.posts.filter((p) => joined.has(p.circleId));
  const notifications = state.notifications.filter(
    (n) => n.userId === state.currentUserId,
  );
  return {
    state,
    ready,
    user,
    joinedCircles,
    feed,
    notifications,
    actions,
    mode: "supabase" as const,
    error,
  };
}
