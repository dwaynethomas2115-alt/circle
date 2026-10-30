import { Storage, Permission, Role } from "appwrite";
import { client } from "./appwrite";
export async function uploadFile(
  fileId: string,
  uri: string,
  mime: string,
  name: string,
  size: number,
  userId: string,
) {
  const bytes = await (await fetch(uri)).blob();
  await new Storage(client).createFile({
    bucketId: "circle-media",
    fileId,
    file: new File([bytes], name, { type: mime }),
    permissions: [
      Permission.read(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ],
  });
}
