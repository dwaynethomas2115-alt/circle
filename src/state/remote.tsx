import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState as NativeAppState } from "react-native";
import {
  account,
  configurationError,
  currentAccount,
  ID,
  invokeCircle,
} from "../lib/appwrite";
import type { AppState, Result } from "../types";
import type { Action } from "./model";
import type { CircleActions, CircleContextValue } from "./types";
import { emptyCircle } from "./empty";
import { prepareMedia } from "../lib/appwriteMedia";
import {
  createSessionRefresher,
  loadSessionSnapshot,
  readSessionAccount,
  sessionHttpStatus,
  signInWithSession,
  type AuthStatus,
  type SessionRefreshResult,
} from "../lib/session";
import {
  getPostMediaInput,
  preparePostAttachments,
  requireAlbumSupport,
  type PostMediaCapabilities,
} from "../lib/postMedia";

/** Appwrite Auth + server-authorized snapshots. No remote state is persisted locally. */
export function useRemoteCircle(): CircleContextValue {
  const [connection, setConnection] = useState<
    SessionRefreshResult & { ready: boolean }
  >({ status: "unknown", state: emptyCircle(), error: null, ready: false });
  const { state, ready, error, status: authStatus } = connection;
  const latestStatus = useRef<AuthStatus>("unknown");
  const authBusy = useRef(false);
  const controller = useRef<ReturnType<typeof createSessionRefresher> | null>(
    null,
  );
  if (!controller.current)
    controller.current = createSessionRefresher(
      async () => {
        const problem = configurationError();
        if (problem)
          return { status: "unknown", state: emptyCircle(), error: problem };
        return loadSessionSnapshot({
          currentAccount,
          snapshot: () => invokeCircle<AppState>({ kind: "snapshot" }),
        });
      },
      (result) => {
        latestStatus.current = result.status;
        setConnection((previous) => ({
          ...result,
          state: { ...result.state, theme: previous.state.theme },
          ready: true,
        }));
      },
    );
  const refresh = useCallback(() => controller.current!.refresh(), []);
  const refreshFresh = useCallback(() => {
    controller.current!.invalidate();
    return refresh();
  }, [refresh]);
  useEffect(() => {
    controller.current!.setActive(true);
    void refresh();
    const timer = setInterval(() => {
      if (
        NativeAppState.currentState === "active" ||
        (typeof document !== "undefined" &&
          document.visibilityState === "visible")
      )
        void refresh();
    }, 10_000);
    const foreground = NativeAppState.addEventListener("change", (value) => {
      if (value === "active") void refreshFresh();
    });
    const visible = () => {
      if (document.visibilityState === "visible") void refreshFresh();
    };
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", visible);
    return () => {
      controller.current!.setActive(false);
      clearInterval(timer);
      foreground.remove();
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, refreshFresh]);
  const run = useCallback(
    async (work: () => Promise<Result>): Promise<Result> => {
      if (authBusy.current)
        return { ok: false, error: "Please wait for sign-in to finish." };
      if (latestStatus.current !== "authenticated")
        return {
          ok: false,
          error: "Reconnect to Circle before making changes.",
        };
      try {
        const problem = configurationError();
        if (problem) throw new Error(problem);
        const result = await work();
        controller.current!.invalidate();
        await refresh();
        return result;
      } catch (cause) {
        controller.current!.invalidate();
        await refresh();
        return {
          ok: false,
          error:
            cause instanceof Error ? cause.message : "The operation failed.",
        };
      }
    },
    [refresh],
  );
  const authenticate = useCallback(
    async (work: () => Promise<Result>): Promise<Result> => {
      if (authBusy.current)
        return {
          ok: false,
          error: "Please wait for the current sign-in operation.",
        };
      authBusy.current = true;
      controller.current!.setPaused(true);
      let result: Result;
      try {
        const problem = configurationError();
        if (problem) throw new Error(problem);
        result = await work();
      } catch (cause) {
        result = {
          ok: false,
          error:
            cause instanceof Error
              ? cause.message
              : "Sign-in could not finish.",
          ...(typeof (cause as { code?: unknown } | null)?.code === "string"
            ? { code: (cause as { code: string }).code }
            : {}),
        };
      } finally {
        controller.current!.setPaused(false);
      }
      try {
        await refresh();
        return result;
      } finally {
        // Keep competing auth/write actions blocked until identity/data refresh
        // completes, not merely until the session POST/DELETE finishes.
        authBusy.current = false;
      }
    },
    [refresh],
  );
  const dispatch = useCallback(
    (action: Action) =>
      run(() => invokeCircle<Result>({ kind: "action", action })),
    [run],
  );
  const actions = useMemo<CircleActions>(
    () => ({
      signIn: (email, _name, password) =>
        authenticate(async () => {
          await signInWithSession(account, email, password);
          return { ok: true };
        }),
      signUp: (name, username, email, adult, password) =>
        authenticate(async () => {
          if (!adult)
            throw new Error("Circle accounts are for adults 18 and older.");
          if (!password || password.length < 8)
            throw new Error("Use at least 8 characters for your password.");
          if (!/^[a-z0-9_]{3,24}$/.test(username))
            throw new Error(
              "Use 3–24 lowercase letters, numbers or underscores for your username.",
            );
          if (name.trim().length < 2 || name.trim().length > 80)
            throw new Error("Enter a name between 2 and 80 characters.");
          if (await readSessionAccount(account))
            throw new Error(
              "An account is already signed in. Sign out before creating another account.",
            );
          await account.create({
            userId: ID.unique(),
            email: email.trim(),
            password,
            name: name.trim(),
          });
          await signInWithSession(account, email, password);
          // Profile setup is retryable through profile settings if this call fails.
          return invokeCircle<Result>({
            kind: "action",
            action: { type: "updateProfile", patch: { name, username } },
          });
        }),
      signOut: () =>
        authenticate(async () => {
          latestStatus.current = "unknown";
          setConnection({
            status: "unknown",
            state: emptyCircle(),
            error: null,
            ready: true,
          });
          try {
            await account.deleteSession({ sessionId: "current" });
          } catch (cause) {
            if (sessionHttpStatus(cause) !== 401) throw cause;
          }
          return { ok: true };
        }),
      deleteAccount: () => dispatch({ type: "deleteAccount" }),
      resetDemo: () =>
        Promise.resolve({
          ok: false,
          error: "Demo reset is only available in local demo mode.",
        }),
      updateProfile: (patch) =>
        run(async () =>
          invokeCircle<Result>({
            kind: "action",
            action: {
              type: "updateProfile",
              patch: {
                ...patch,
                ...(patch.avatar !== undefined
                  ? { avatar: await prepareMedia(patch.avatar) }
                  : {}),
              },
            },
          }),
        ),
      createCircle: (input) =>
        run(async () =>
          invokeCircle<Result>({
            kind: "action",
            action: {
              type: "createCircle",
              input: {
                ...input,
                avatar: await prepareMedia(input.avatar),
                cover: await prepareMedia(input.cover),
              },
            },
          }),
        ),
      updateCircle: (circleId, patch) =>
        run(async () =>
          invokeCircle<Result>({
            kind: "action",
            action: {
              type: "updateCircle",
              circleId,
              patch: {
                ...patch,
                ...(patch.avatar !== undefined
                  ? { avatar: await prepareMedia(patch.avatar) }
                  : {}),
                ...(patch.cover !== undefined
                  ? { cover: await prepareMedia(patch.cover) }
                  : {}),
              },
            },
          }),
        ),
      requestJoin: (circleId) => dispatch({ type: "requestJoin", circleId }),
      respondRequest: (requestId, approve) =>
        dispatch({ type: "respondRequest", requestId, approve }),
      createInvitation: (circleId) =>
        dispatch({ type: "createInvitation", circleId }),
      redeemInvitation: (code) => dispatch({ type: "redeemInvitation", code }),
      leaveCircle: (circleId) => dispatch({ type: "leaveCircle", circleId }),
      removeMember: (circleId, userId) =>
        dispatch({ type: "removeMember", circleId, userId }),
      setRole: (circleId, userId, role) =>
        dispatch({ type: "setRole", circleId, userId, role }),
      createPost: (input) =>
        run(async () => {
          const items = getPostMediaInput(input);
          const attachments = await preparePostAttachments(
            items,
            prepareMedia,
            {
              onProgress: input.onUploadProgress,
              signal: input.uploadSignal,
              checkAlbumSupport: () =>
                requireAlbumSupport(items.length, () =>
                  invokeCircle<PostMediaCapabilities>({
                    kind: "mediaCapabilities",
                    circleId: input.circleId,
                  }),
                ),
            },
          );
          return invokeCircle<Result>({
            kind: "action",
            action: {
              type: "createPost",
              input: {
                circleId: input.circleId,
                content: input.content,
                mediaType: attachments[0]?.type,
                mediaDurationMs: items[0]?.durationMs,
                media: attachments[0]?.uri,
                ...(attachments.length > 1 ? { attachments } : {}),
              },
            },
          });
        }),
      deletePost: (postId) => dispatch({ type: "deletePost", postId }),
      toggleReaction: (postId) => dispatch({ type: "toggleReaction", postId }),
      addComment: (postId, content, parentId) =>
        dispatch({ type: "addComment", postId, content, parentId }),
      deleteComment: (commentId) =>
        dispatch({ type: "deleteComment", commentId }),
      sendMessage: (circleId, content) =>
        dispatch({ type: "sendMessage", circleId, content }),
      deleteMessage: (messageId) =>
        dispatch({ type: "deleteMessage", messageId }),
      markRead: (id) =>
        run(async () => {
          for (let batch = 0; batch < 20; batch++) {
            const result = await invokeCircle<Result>({
              kind: "action",
              action: { type: "markRead", id },
            });
            if (id || !result.ok || result.code !== "more_unread")
              return result;
          }
          return {
            ok: false,
            error:
              "Some older notifications remain unread. Run mark read again to continue.",
          };
        }),
      report: (targetType, targetId, reason) =>
        dispatch({ type: "report", targetType, targetId, reason }),
      blockUser: (userId) => dispatch({ type: "blockUser", userId }),
      setTheme: (theme) => {
        setConnection((previous) => ({
          ...previous,
          state: { ...previous.state, theme },
        }));
        return { ok: true };
      },
    }),
    [dispatch, run, authenticate],
  );
  const joined = new Set(
    state.members
      .filter((m) => m.userId === state.currentUserId)
      .map((m) => m.circleId),
  );
  return {
    state,
    ready,
    error,
    authStatus,
    retryConnection: refreshFresh,
    actions,
    mode: "appwrite",
    user: state.users.find((u) => u.id === state.currentUserId) || null,
    joinedCircles: state.circles.filter((c) => joined.has(c.id)),
    feed: state.posts,
    notifications: state.notifications,
  };
}
