import { Storage, Permission, Role, Client } from "react-native-appwrite";
import { client } from "./appwrite";
export async function uploadFile(
  fileId: string,
  uri: string,
  mime: string,
  name: string,
  size: number,
  userId: string,
) {
  await new Storage(client as unknown as Client).createFile({
    bucketId: "circle-media",
    fileId,
    file: { uri, type: mime, name, size },
    permissions: [
      Permission.read(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ],
  });
}
