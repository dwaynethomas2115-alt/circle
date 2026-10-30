// Metro selects appwriteSdk.native.ts on iOS/Android; web uses cookie sessions.
export { Account, Client, Functions, ID } from "appwrite";
export const configurePlatform = <T>(client: T): T => client;
