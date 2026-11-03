import { createContext, useContext } from "react";
import type { PostDraftStore } from "./postDrafts";

export const PostDraftContext = createContext<PostDraftStore | null>(null);
export function usePostDraftStore() {
  const store = useContext(PostDraftContext);
  if (!store) throw new Error("Post drafts require CircleProvider.");
  return store;
}
