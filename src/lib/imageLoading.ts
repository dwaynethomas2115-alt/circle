import { videoMediaIdentity } from "./videoPlayback";

/** Signing credentials change access, not the identity of an already drawn file.
 * Unknown URL schemes/queries retain their full identity through this helper.
 */
export const imageMediaIdentity = videoMediaIdentity;

export function imageAccessScope(
  userId: string | undefined,
  members: readonly { userId: string; circleId: string; role: string }[],
  circleId?: string,
): string {
  return JSON.stringify([
    userId || null,
    members
      .filter(
        (member) =>
          member.userId === userId &&
          (!circleId || member.circleId === circleId),
      )
      .map((member) => [member.circleId, member.role].join(":"))
      .sort(),
  ]);
}

export function isSignedPrivateImage(uri: string): boolean {
  try {
    const url = new URL(uri);
    return /^\/(?:v1\/)?storage\/buckets\/circle-media\/files\/[\w.-]+\/view$/.test(
      url.pathname,
    );
  } catch {
    return false;
  }
}

/** Native supplies source dimensions; web supplies the loaded HTML image.
 * Reading that event avoids a separate Image.getSize probe before rendering.
 */
export function loadedImageDimensions(
  event: unknown,
): { width: number; height: number } | null {
  const value = event as {
    nativeEvent?: {
      source?: { width?: unknown; height?: unknown };
      target?: { naturalWidth?: unknown; naturalHeight?: unknown };
    };
    target?: { naturalWidth?: unknown; naturalHeight?: unknown };
  } | null;
  const source = value?.nativeEvent?.source;
  const target = value?.nativeEvent?.target ?? value?.target;
  const width = source?.width ?? target?.naturalWidth;
  const height = source?.height ?? target?.naturalHeight;
  return typeof width === "number" &&
    typeof height === "number" &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
    ? { width, height }
    : null;
}
