import type { AppState } from "../types";
export const emptyCircle = (): AppState => ({
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
