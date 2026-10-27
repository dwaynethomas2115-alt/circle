import React, { createContext, useContext } from "react";
import { isSupabaseConfigured } from "../lib/supabase";
import { useDemoCircle } from "./demo";
import { useRemoteCircle } from "./remote";
import { CircleContextValue } from "./types";
export type { CircleContextValue, CircleActions } from "./types";
const CircleContext = createContext<CircleContextValue | null>(null);
function DemoProvider({ children }: { children: React.ReactNode }) {
  return (
    <CircleContext.Provider value={useDemoCircle()}>
      {children}
    </CircleContext.Provider>
  );
}
function RemoteProvider({ children }: { children: React.ReactNode }) {
  return (
    <CircleContext.Provider value={useRemoteCircle()}>
      {children}
    </CircleContext.Provider>
  );
}
export function CircleProvider({ children }: { children: React.ReactNode }) {
  return isSupabaseConfigured ? (
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
