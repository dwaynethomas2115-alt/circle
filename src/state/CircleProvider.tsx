import React, { createContext, useContext, useMemo, useRef } from "react";
import { isAppwriteEnabled } from "../lib/appwrite";
import { useDemoCircle } from "./demo";
import { useRemoteCircle } from "./remote";
import { CircleContextValue } from "./types";
import { createPostDraftStore, type PostDraftStore } from "./postDrafts";
import { PostDraftContext } from "./PostDraftContext";
export type { CircleContextValue, CircleActions } from "./types";
const CircleContext = createContext<CircleContextValue | null>(null);
function DemoProvider({ children }: { children: React.ReactNode }) {
  return (
    <CircleValueProvider value={useDemoCircle()}>
      {children}
    </CircleValueProvider>
  );
}
function RemoteProvider({ children }: { children: React.ReactNode }) {
  return (
    <CircleValueProvider value={useRemoteCircle()}>
      {children}
    </CircleValueProvider>
  );
}
function CircleValueProvider({
  value,
  children,
}: {
  value: CircleContextValue;
  children: React.ReactNode;
}) {
  const storeRef = useRef<PostDraftStore | null>(null);
  if (!storeRef.current) storeRef.current = createPostDraftStore();
  const store = storeRef.current;
  // Observe before child render/cleanup: stale picker callbacks cannot rewrite a
  // cleared draft during account changes, sign-out, or membership revocation.
  store.observe({
    status: !value.ready
      ? "unknown"
      : value.authStatus || (value.user ? "authenticated" : "signedOut"),
    accountId: value.user?.id,
    circleIds: value.joinedCircles.map((circle) => circle.id),
  });
  const actions = useMemo(
    () => ({
      ...value.actions,
      signOut: () => {
        store.clear();
        return value.actions.signOut();
      },
      deleteAccount: () => {
        store.clear();
        return value.actions.deleteAccount();
      },
    }),
    [store, value.actions],
  );
  return (
    <CircleContext.Provider value={{ ...value, actions }}>
      <PostDraftContext.Provider value={store}>
        {children}
      </PostDraftContext.Provider>
    </CircleContext.Provider>
  );
}
export function CircleProvider({ children }: { children: React.ReactNode }) {
  return isAppwriteEnabled ? (
    <RemoteProvider>{children}</RemoteProvider>
  ) : (
    <DemoProvider>{children}</DemoProvider>
  );
}
export function useCircle() {
  const value = useContext(CircleContext);
  if (!value) throw new Error("useCircle must be used within CircleProvider.");
  return value;
}
