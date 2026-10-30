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

/** Appwrite Auth + server-authorized snapshots. No remote state is persisted locally. */
export function useRemoteCircle(): CircleContextValue {
  const [state, setState] = useState<AppState>(emptyCircle);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0),
    mounted = useRef(true);
  const signingOut = useRef(false);
  const refresh = useCallback(async () => {
    if (signingOut.current) return;
    const token = ++generation.current;
    try {
      const user = await currentAccount();
      const next = user
        ? await invokeCircle<AppState>({ kind: "snapshot" })
        : emptyCircle();
      if (mounted.current && generation.current === token) {
        setState((previous) => ({ ...next, theme: previous.theme }));
        setError(null);
      }
    } catch (cause) {
      if (mounted.current && generation.current === token) {
        setState(emptyCircle());
        setError(
          cause instanceof Error ? cause.message : "Circle could not connect.",
        );
      }
    } finally {
      if (mounted.current && generation.current === token) setReady(true);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
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
      if (value === "active") void refresh();
    });
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false;
      // Invalidate asynchronous requests; this ref is a counter, not a DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++generation.current;
      clearInterval(timer);
      foreground.remove();
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  const run = useCallback(
    async (work: () => Promise<Result>): Promise<Result> => {
      try {
        const problem = configurationError();
        if (problem) throw new Error(problem);
        const result = await work();
        await refresh();
        return result;
      } catch (cause) {
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
  const dispatch = useCallback(
    (action: Action) =>
      run(() => invokeCircle<Result>({ kind: "action", action })),
    [run],
  );
  const actions = useMemo<CircleActions>(
    () => ({
      signIn: (email, _name, password) =>
        run(async () => {
          if (!password) throw new Error("Enter your password.");
          await account.createEmailPasswordSession({
            email: email.trim(),
            password,
          });
          return { ok: true };
        }),
      signUp: (name, username, email, adult, password) =>
        run(async () => {
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
          await account.create({
            userId: ID.unique(),
            email: email.trim(),
            password,
            name: name.trim(),
          });
          await account.createEmailPasswordSession({
            email: email.trim(),
            password,
          });
          // Profile setup is retryable through profile settings if this call fails.
          return invokeCircle<Result>({
            kind: "action",
            action: { type: "updateProfile", patch: { name, username } },
          });
        }),
      signOut: () =>
        run(async () => {
          signingOut.current = true;
          ++generation.current;
          setState(emptyCircle());
          try {
            await account.deleteSession({ sessionId: "current" });
          } finally {
            signingOut.current = false;
            ++generation.current;
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
        run(async () =>
          invokeCircle<Result>({
            kind: "action",
            action: {
              type: "createPost",
              input: {
                circleId: input.circleId,
                content: input.content,
                mediaType: input.mediaType,
                mediaDurationMs: input.mediaDurationMs,
                media: await prepareMedia(
                  input.media,
                  input.mediaType,
                  input.mediaDurationMs,
                  {
                    mimeType: input.mediaMimeType,
                    onProgress: input.onUploadProgress,
                    signal: input.uploadSignal,
                  },
                ),
              },
            },
          }),
        ),
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
        setState((previous) => ({ ...previous, theme }));
        return { ok: true };
      },
    }),
    [dispatch, run],
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
    actions,
    mode: "appwrite",
    user: state.users.find((u) => u.id === state.currentUserId) || null,
    joinedCircles: state.circles.filter((c) => joined.has(c.id)),
    feed: state.posts,
    notifications: state.notifications,
  };
}
