import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import {
  PHOTO_JPEG_QUALITY,
  photoResize,
  validateMedia,
  type MediaUploadOptions,
} from "./media";
import { currentAccount, invokeCircle } from "./appwrite";
import { uploadFile } from "./appwriteUpload";
import { openUploadSource } from "./uploadSource";
import {
  appwriteUploadError,
  checkUploadCanceled,
} from "./appwriteUploadChunks";
import type { Result } from "../types";

/** Uploads are owner-only until the function seals them and authorizes publication. */
export async function prepareMedia(
  uri: string | undefined,
  type: "image" | "video" = "image",
  durationMs?: number,
  options: MediaUploadOptions = {},
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
  checkUploadCanceled(options.signal);
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
  const opened = await openUploadSource(source);
  let reservationId: string | undefined;
  let sealed = false;
  try {
    const problem = validateMedia({
      type,
      bytes: opened.size,
      durationMs,
      mimeType:
        type === "video" ? options.mimeType || opened.contentType : undefined,
    });
    if (problem) throw new Error(problem);
    if (
      type === "video" &&
      (options.mimeType === "video/quicktime" ||
        opened.contentType === "video/quicktime")
    )
      mime = "video/quicktime";
    checkUploadCanceled(options.signal);
    const reservation = await invokeCircle<Result>({
      kind: "beginUpload",
      mediaType: type,
    });
    if (!reservation.ok || !reservation.id)
      throw new Error(reservation.error || "Upload could not start.");
    reservationId = reservation.id;
    await uploadFile(
      reservation.id,
      opened.uri || source,
      mime,
      `${reservation.id}.${type === "image" ? "jpg" : mime === "video/quicktime" ? "mov" : "mp4"}`,
      opened.size,
      user.$id,
      options,
      opened,
    );
    checkUploadCanceled(options.signal);
    const result = await invokeCircle<Result>({
      kind: "finishUpload",
      fileId: reservation.id,
    });
    if (!result.ok)
      throw new Error(result.error || "Upload could not finish. Please retry.");
    sealed = true;
    return `awfile:${reservation.id}`;
  } catch (cause) {
    if (reservationId && !sealed)
      await invokeCircle<Result>({
        kind: "cancelUpload",
        fileId: reservationId,
      }).catch(() => {});
    checkUploadCanceled(options.signal);
    throw appwriteUploadError(cause);
  } finally {
    await opened.close?.().catch(() => {});
  }
}
