/** Shared limits for the picker, previews, and private-media uploads. */
export const MEDIA_MAX_BYTES = 50_000_000;
export const VIDEO_MAX_DURATION_MS = 60_000;
export const PHOTO_MAX_EDGE = 2560;
export const PHOTO_JPEG_QUALITY = 0.9;

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
  if (input.bytes && input.bytes > MEDIA_MAX_BYTES)
    return "Please choose a file smaller than 50 MB.";
  if (input.type === "video") {
    if (
      !input.durationMs ||
      input.durationMs <= 0 ||
      !Number.isFinite(input.durationMs)
    )
      return "We couldn’t read this video. Please choose an MP4 or MOV video up to one minute long.";
    if (input.durationMs > VIDEO_MAX_DURATION_MS)
      return "Please choose a video up to one minute long.";
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
