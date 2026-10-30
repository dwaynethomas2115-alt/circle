/** Shared limits for the picker, previews, and private-media uploads. */
export const PHOTO_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 250 * 1024 * 1024;
/** Maximum attachment size; photos have their own smaller limit. */
export const MEDIA_MAX_BYTES = VIDEO_MAX_BYTES;
export const VIDEO_MAX_DURATION_MS = 10 * 60_000;
export const PHOTO_MAX_EDGE = 4096;
export const PHOTO_JPEG_QUALITY = 0.95;

export function mediaMaxBytes(type: "image" | "video") {
  return type === "image" ? PHOTO_MAX_BYTES : VIDEO_MAX_BYTES;
}

export interface MediaDimensions {
  width: number;
  height: number;
}

/** Resize the longest edge, preserving aspect ratio and never enlarging photos. */
export function photoResize(
  width: number,
  height: number,
): MediaDimensions | undefined {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return undefined;
  if (Math.max(width, height) <= PHOTO_MAX_EDGE) return undefined;
  const scale = PHOTO_MAX_EDGE / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** The frame can be bounded while contentFit=contain keeps every pixel visible. */
export function mediaFrameRatio(width?: number, height?: number): number {
  if (
    !width ||
    !height ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(width / height)
  )
    return 1.62;
  return Math.min(2.1, Math.max(0.78, width / height));
}

export function validateMedia(input: {
  type: "image" | "video";
  bytes?: number;
  durationMs?: number;
  mimeType?: string | null;
}) {
  if (
    input.bytes !== undefined &&
    (!Number.isFinite(input.bytes) || input.bytes <= 0)
  )
    return "This file is empty or could not be read. Please choose it again.";
  if (input.bytes && input.bytes > mediaMaxBytes(input.type))
    return input.type === "image"
      ? "Please choose a photo up to 50 MB."
      : "Please choose a video up to 250 MB.";
  if (input.type === "video") {
    if (
      !input.durationMs ||
      input.durationMs <= 0 ||
      !Number.isFinite(input.durationMs)
    )
      return "We couldn’t read this video. Please choose an MP4 or MOV video up to 10 minutes long.";
    if (input.durationMs > VIDEO_MAX_DURATION_MS)
      return "Please choose a video up to 10 minutes long.";
    if (
      input.mimeType &&
      !["video/mp4", "video/quicktime", "video/x-m4v"].includes(
        input.mimeType.toLowerCase(),
      )
    )
      return "Please choose an MP4 or MOV video.";
  }
  return null;
}

export function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
