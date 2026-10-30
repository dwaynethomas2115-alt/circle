import "react-native-url-polyfill/auto";
import { Client } from "react-native-appwrite";
export { Account, Client, Functions, ID } from "react-native-appwrite";
export const configurePlatform = (client: Client) =>
  client.setPlatform("app.circle.private");
