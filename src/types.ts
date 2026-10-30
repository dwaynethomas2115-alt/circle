export type Category =
  "Family" | "Friends" | "School" | "Community" | "Hobby" | "Other";
export type Role = "owner" | "admin" | "moderator" | "member";
export interface Profile {
  id: string;
  name: string;
  username: string;
  avatar: string;
  bio: string;
  email?: string;
}
export interface Circle {
  id: string;
  name: string;
  description: string;
  category: Category;
  avatar: string;
  cover: string;
  color: string;
  discoverable: boolean;
  approvalRequired: boolean;
  ownerId: string;
  createdAt: string;
}
export interface Member {
  circleId: string;
  userId: string;
  role: Role;
  joinedAt: string;
}
export interface JoinRequest {
  id: string;
  circleId: string;
  userId: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}
export interface Invitation {
  id: string;
  circleId: string;
  code: string;
  createdBy: string;
  expiresAt: string;
  usedBy?: string;
}
export interface Post {
  id: string;
  circleId: string;
  authorId: string;
  content: string;
  media?: string;
  mediaType?: "image" | "video";
  createdAt: string;
  reactions: string[];
  tag?: string;
}
export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  parentId?: string;
  createdAt: string;
}
export interface Message {
  id: string;
  circleId: string;
  authorId: string;
  content: string;
  createdAt: string;
}
export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: "request" | "approval" | "comment" | "reaction" | "invitation" | "post";
  circleId?: string;
  postId?: string;
  read: boolean;
  createdAt: string;
}
export interface Report {
  id: string;
  userId: string;
  circleId?: string;
  targetType: "post" | "comment" | "message";
  targetId: string;
  reason: string;
  createdAt: string;
}
export interface AppState {
  version: 1;
  currentUserId: string | null;
  users: Profile[];
  circles: Circle[];
  members: Member[];
  requests: JoinRequest[];
  invitations: Invitation[];
  posts: Post[];
  comments: Comment[];
  messages: Message[];
  notifications: Notification[];
  blocks: { userId: string; blockedId: string }[];
  reports: Report[];
  theme: "light" | "dark" | "system";
}
export interface Result {
  ok: boolean;
  error?: string;
  id?: string;
  code?: string;
}
export interface CreateCircleInput {
  name: string;
  description: string;
  category: Category;
  avatar?: string;
  cover?: string;
  discoverable: boolean;
  approvalRequired?: boolean;
}
export interface CreatePostInput {
  circleId: string;
  content: string;
  media?: string;
  mediaType?: "image" | "video";
  mediaDurationMs?: number;
  mediaMimeType?: string;
  onUploadProgress?: (progress: { uploaded: number; total: number }) => void;
  uploadSignal?: AbortSignal;
}
