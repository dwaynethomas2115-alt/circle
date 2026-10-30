import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import {
  MEDIA_MAX_BYTES,
  PHOTO_JPEG_QUALITY,
  photoResize,
  validateMedia,
} from "./media";
import { currentAccount, invokeCircle } from "./appwrite";
import { uploadFile } from "./appwriteUpload";
import type { Result } from "../types";

/** Uploads are owner-only until the function seals them and authorizes publication. */
export async function prepareMedia(
  uri: string | undefined,
  type: "image" | "video" = "image",
  durationMs?: number,
): Promise<string | undefined> {
  if (!uri) return uri;
  if (uri.startsWith("awfile:")) return uri;
  const endpoint = process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT;
  if (
    endpoint &&
    uri.startsWith(endpoint + "/storage/buckets/circle-media/files/")
  ) {
    const match = new URL(uri).pathname.match(/\/files\/([\w-]+)\/view$/);
    if (match) return `awfile:${match[1]}`;
  }
  if (!/^(file:|blob:|data:|content:|ph:|assets-library:)/.test(uri))
    return uri; // Emoji; server rejects arbitrary remote URLs.
  const user = await currentAccount();
  if (!user) throw new Error("Sign in to upload media.");
  let source = uri,
    mime = "video/mp4";
  if (type === "image") {
    const context = ImageManipulator.manipulate(uri),
      original = await context.renderAsync();
    const resize = photoResize(original.width, original.height);
    if (resize) context.resize(resize);
    source = (
      await (resize ? await context.renderAsync() : original).saveAsync({
        format: SaveFormat.JPEG,
        compress: PHOTO_JPEG_QUALITY,
      })
    ).uri;
    mime = "image/jpeg";
  } else {
    const problem = validateMedia({ type, durationMs });
    if (problem) throw new Error(problem);
    if (/\.mov(?:[?#]|$)/i.test(uri)) mime = "video/quicktime";
  }
  const response = await fetch(source);
  if (!response.ok) throw new Error("The selected file could not be read.");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MEDIA_MAX_BYTES)
    throw new Error("Media must be under 50 MB.");
  const reservation = await invokeCircle<Result>({
    kind: "beginUpload",
    mediaType: type,
  });
  if (!reservation.ok || !reservation.id)
    throw new Error(reservation.error || "Upload could not start.");
  await uploadFile(
    reservation.id,
    source,
    mime,
    `${reservation.id}.${type === "image" ? "jpg" : mime === "video/quicktime" ? "mov" : "mp4"}`,
    bytes.byteLength,
    user.$id,
  );
  const sealed = await invokeCircle<Result>({
    kind: "finishUpload",
    fileId: reservation.id,
  });
  if (!sealed.ok)
    throw new Error(sealed.error || "Upload could not finish. Please retry.");
  return `awfile:${reservation.id}`;
}
