import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createSeed } from "../data/seed";
import { demoAssets } from "../data/assets";
import { AppState, Result } from "../types";
import { Action, transition, visibleFeed } from "./model";
import { CircleActions, CircleContextValue } from "./types";
import { getPostMediaInput, preparePostAttachments } from "../lib/postMedia";
import { serializeDemoState } from "./persistence";
import {
  persistDemoMedia,
  hydrateDemoMedia,
  serializeDemoMedia,
  removeUnusedDemoMedia,
  discardUncommittedDemoMedia,
} from "../lib/demoMedia";
const createLocalSeed = () => createSeed(demoAssets());
const STORAGE_KEY = "circle.demo.v1";
export function useDemoCircle(): CircleContextValue {
  const [state, setState] = useState<AppState>(createLocalSeed);
  const stateRef = useRef(state);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const writes = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (raw) => {
        if (!mounted) return;
        if (raw) {
          const loaded = await hydrateDemoMedia(raw, demoAssets());
          if (!mounted) return;
          stateRef.current = loaded.state;
          setState(loaded.state);
          if (loaded.missing)
            setError(
              "Some local demo attachments are no longer available on this device.",
            );
        }
      })
      .catch(() => {
        if (mounted)
          setError(
            "Your saved demo could not be loaded. Changes may not persist.",
          );
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);
  const dispatch = useCallback((action: Action): Promise<Result> => {
    const task = writes.current.then(async () => {
      const previous = stateRef.current;
      const outcome =
        action.type === "resetDemo"
          ? { state: createLocalSeed(), result: { ok: true } }
          : transition(previous, action);
      if (!outcome.result.ok) return outcome.result;
      // Persist before reporting success. The serialized queue also prevents rapid
      // edits from racing each other or saving an older state over a newer one.
      await AsyncStorage.setItem(
        STORAGE_KEY,
        serializeDemoState(outcome.state, demoAssets(), serializeDemoMedia),
      );
      stateRef.current = outcome.state;
      setState(outcome.state);
      try {
        await removeUnusedDemoMedia(previous, outcome.state);
      } catch {
        setError(
          "Your changes were saved, but this device could not remove an unused demo attachment.",
        );
      }
      return outcome.result;
    });
    writes.current = task.then(
      () => undefined,
      () => undefined,
    );
    return task.catch(() => ({
      ok: false,
      error:
        "This device could not save your changes. Free some local storage and try again.",
    }));
  }, []);
  const withMedia = useCallback(
    async (
      work: (persist: typeof persistDemoMedia) => Promise<Result>,
    ): Promise<Result> => {
      const prepared: string[] = [];
      const persist: typeof persistDemoMedia = async (uri) => {
        const saved = await persistDemoMedia(uri);
        if (saved && saved !== uri) prepared.push(saved);
        return saved;
      };
      let result: Result;
      try {
        result = await work(persist);
      } catch (error) {
        result = {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "This device could not save your attachment.",
        };
      }
      if (!result.ok) {
        try {
          await discardUncommittedDemoMedia(prepared, stateRef.current);
        } catch {
          setError(
            "An unused local demo attachment could not be removed from this device.",
          );
        }
      }
      return result;
    },
    [],
  );
  const actions = useMemo<CircleActions>(
    () => ({
      signIn: (email, name) => dispatch({ type: "signIn", email, name }),
      signUp: (name, username, email, adult) =>
        dispatch({ type: "signUp", name, username, email, adult }),
      signOut: () => dispatch({ type: "signOut" }),
      deleteAccount: () => dispatch({ type: "deleteAccount" }),
      resetDemo: () => dispatch({ type: "resetDemo" }),
      updateProfile: (patch) =>
        withMedia(async (persist) =>
          dispatch({
            type: "updateProfile",
            patch: {
              ...patch,
              ...(patch.avatar ? { avatar: await persist(patch.avatar) } : {}),
            },
          }),
        ),
      createCircle: (input) =>
        withMedia(async (persist) =>
          dispatch({
            type: "createCircle",
            input: {
              ...input,
              avatar: await persist(input.avatar),
              cover: await persist(input.cover),
            },
          }),
        ),
      updateCircle: (circleId, patch) =>
        withMedia(async (persist) =>
          dispatch({
            type: "updateCircle",
            circleId,
            patch: {
              ...patch,
              ...(patch.avatar ? { avatar: await persist(patch.avatar) } : {}),
              ...(patch.cover ? { cover: await persist(patch.cover) } : {}),
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
        withMedia(async (persist) => {
          const attachments = await preparePostAttachments(
            getPostMediaInput(input),
            async (uri) => persist(uri),
            { signal: input.uploadSignal },
          );
          return dispatch({
            type: "createPost",
            input: {
              ...input,
              attachments,
              media: attachments[0]?.uri,
              mediaType: attachments[0]?.type,
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
      markRead: (id) => dispatch({ type: "markRead", id }),
      report: (targetType, targetId, reason) =>
        dispatch({ type: "report", targetType, targetId, reason }),
      blockUser: (userId) => dispatch({ type: "blockUser", userId }),
      setTheme: (theme) => dispatch({ type: "setTheme", theme }),
    }),
    [dispatch, withMedia],
  );
  return useMemo(
    () => ({
      state,
      ready,
      user: state.users.find((u) => u.id === state.currentUserId) ?? null,
      joinedCircles: state.circles.filter((c) =>
        state.members.some(
          (m) => m.circleId === c.id && m.userId === state.currentUserId,
        ),
      ),
      feed: visibleFeed(state),
      notifications: state.notifications.filter(
        (n) => n.userId === state.currentUserId,
      ),
      actions,
      error,
      mode: "demo",
    }),
    [state, ready, actions, error],
  );
}
