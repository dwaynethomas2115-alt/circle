import type { PostAttachment, PostAttachmentInput } from "../types";
import type { MediaUploadOptions } from "./media";

export const MAX_POST_PHOTOS = 10;
export interface PostMediaCapabilities {
  maxPostPhotos: number;
}

export async function requireAlbumSupport(
  photoCount: number,
  load: () => Promise<PostMediaCapabilities>,
): Promise<void> {
  const updateMessage =
    "Photo albums need the latest Circle server update. Your draft is still here.";
  try {
    const capabilities = await load();
    if (
      !capabilities ||
      capabilities.maxPostPhotos < photoCount ||
      !Number.isInteger(capabilities.maxPostPhotos)
    )
      throw new Error(updateMessage);
  } catch (cause) {
    if (
      cause instanceof Error &&
      /invalid.*request|request.*invalid/i.test(cause.message)
    )
      throw new Error(updateMessage);
    throw cause;
  }
}

/** Albums are optional so saved and hosted single-photo posts keep working. */
export function getPostMedia(post: {
  attachments?: PostAttachment[];
  media?: string;
  mediaType?: "image" | "video";
}): PostAttachment[] {
  if (post.attachments?.length) return post.attachments;
  return post.media
    ? [{ uri: post.media, type: post.mediaType || "image" }]
    : [];
}

export function validatePostMedia(
  items: readonly PostAttachment[],
): string | null {
  if (items.length > MAX_POST_PHOTOS)
    return `Choose up to ${MAX_POST_PHOTOS} photos for one moment.`;
  if (
    items.some((item) => !item.uri || !["image", "video"].includes(item.type))
  )
    return "Choose a photo or video for each attachment.";
  if (items.length > 1 && items.some((item) => item.type === "video"))
    return "Share up to 10 photos together, or one video on its own.";
  if (new Set(items.map((item) => item.uri)).size !== items.length)
    return "Each photo can appear once in a moment.";
  if (
    items.some((item) =>
      [item.width, item.height].some(
        (value) =>
          value !== undefined &&
          (!Number.isFinite(value) || value <= 0 || value > 100_000),
      ),
    )
  )
    return "This attachment has invalid dimensions. Choose it again.";
  return null;
}

export function getPostMediaInput(input: {
  attachments?: PostAttachmentInput[];
  media?: string;
  mediaType?: "image" | "video";
  mediaDurationMs?: number;
  mediaMimeType?: string;
}): PostAttachmentInput[] {
  if (input.attachments?.length) return input.attachments;
  return input.media
    ? [
        {
          uri: input.media,
          type: input.mediaType || "image",
          durationMs: input.mediaDurationMs,
          mimeType: input.mediaMimeType,
        },
      ]
    : [];
}

/** Upload every item before publishing the single post; never publish a partial album. */
export async function preparePostAttachments(
  items: readonly PostAttachmentInput[],
  prepare: (
    uri: string,
    type: "image" | "video",
    durationMs: number | undefined,
    options: MediaUploadOptions,
  ) => Promise<string | undefined>,
  options: MediaUploadOptions & {
    checkAlbumSupport?: () => Promise<void>;
  } = {},
): Promise<PostAttachment[]> {
  const problem = validatePostMedia(items);
  if (problem) throw new Error(problem);
  const { checkAlbumSupport, ...uploadOptions } = options;
  if (items.length > 1) await checkAlbumSupport?.();
  const prepared: PostAttachment[] = [];
  for (const [index, item] of items.entries()) {
    if (options.signal?.aborted)
      throw new Error("Upload canceled. Your draft is still here.");
    const uri = await prepare(item.uri, item.type, item.durationMs, {
      ...uploadOptions,
      mimeType: item.mimeType,
      onProgress: options.onProgress
        ? (progress) =>
            options.onProgress!({
              ...progress,
              itemIndex: index + 1,
              itemCount: items.length,
            })
        : undefined,
    });
    if (!uri)
      throw new Error(
        "An attachment could not finish uploading. Your draft is still here.",
      );
    prepared.push({
      uri,
      type: item.type,
      ...(item.width ? { width: item.width } : {}),
      ...(item.height ? { height: item.height } : {}),
    });
  }
  if (options.signal?.aborted)
    throw new Error("Upload canceled. Your draft is still here.");
  return prepared;
}
