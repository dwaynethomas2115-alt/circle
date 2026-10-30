import {
  AppState,
  Circle,
  CreateCircleInput,
  CreatePostInput,
  Notification,
  Post,
  Profile,
  Result,
  Role,
} from "../types";
export interface CircleActions {
  signIn(
    email: string,
    name?: string,
    password?: string,
  ): Result | Promise<Result>;
  signUp(
    name: string,
    username: string,
    email: string,
    adult: boolean,
    password?: string,
  ): Result | Promise<Result>;
  signOut(): Result | Promise<Result>;
  deleteAccount(): Result | Promise<Result>;
  resetDemo(): Result | Promise<Result>;
  updateProfile(patch: Partial<Profile>): Result | Promise<Result>;
  createCircle(input: CreateCircleInput): Result | Promise<Result>;
  updateCircle(
    circleId: string,
    patch: Partial<CreateCircleInput>,
  ): Result | Promise<Result>;
  requestJoin(circleId: string): Result | Promise<Result>;
  respondRequest(requestId: string, approve: boolean): Result | Promise<Result>;
  createInvitation(circleId: string): Result | Promise<Result>;
  redeemInvitation(code: string): Result | Promise<Result>;
  leaveCircle(circleId: string): Result | Promise<Result>;
  removeMember(circleId: string, userId: string): Result | Promise<Result>;
  setRole(
    circleId: string,
    userId: string,
    role: Role,
  ): Result | Promise<Result>;
  createPost(input: CreatePostInput): Result | Promise<Result>;
  deletePost(postId: string): Result | Promise<Result>;
  toggleReaction(postId: string): Result | Promise<Result>;
  addComment(
    postId: string,
    content: string,
    parentId?: string,
  ): Result | Promise<Result>;
  deleteComment(commentId: string): Result | Promise<Result>;
  sendMessage(circleId: string, content: string): Result | Promise<Result>;
  deleteMessage(messageId: string): Result | Promise<Result>;
  markRead(id?: string): Result | Promise<Result>;
  report(
    targetType: "post" | "comment" | "message",
    targetId: string,
    reason: string,
  ): Result | Promise<Result>;
  blockUser(userId: string): Result | Promise<Result>;
  setTheme(theme: AppState["theme"]): Result | Promise<Result>;
}
export interface CircleContextValue {
  state: AppState;
  ready: boolean;
  user: Profile | null;
  joinedCircles: Circle[];
  feed: Post[];
  notifications: Notification[];
  actions: CircleActions;
  error?: string | null;
  mode: "demo" | "appwrite";
}
