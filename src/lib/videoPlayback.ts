/** A refreshed access signature is still the same movie, not a new source. */
export function videoMediaIdentity(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.protocol !== "https:" && url.protocol !== "http:") return uri;
    // Only strip signing credentials on known signing schemes. Other query
    // values may identify a different movie or rendition and must be retained.
    const supabaseSigned = /\/storage\/v1\/object\/sign\//.test(url.pathname);
    const hasAwsSignature = url.searchParams.has("X-Amz-Signature");
    const hasGoogleSignature = url.searchParams.has("X-Goog-Signature");
    const hasCloudFrontSignature =
      url.searchParams.has("Signature") && url.searchParams.has("Key-Pair-Id");
    for (const key of [...url.searchParams.keys()]) {
      if (
        (supabaseSigned && key === "token") ||
        (hasAwsSignature && key.startsWith("X-Amz-")) ||
        (hasGoogleSignature && key.startsWith("X-Goog-")) ||
        (hasCloudFrontSignature &&
          ["Signature", "Key-Pair-Id", "Expires", "Policy"].includes(key))
      )
        url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch {
    return uri;
  }
}

export interface VideoPlaybackSnapshot {
  currentTime: number;
  playing: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
}
interface PlaybackReader extends VideoPlaybackSnapshot {
  readonly playing: boolean;
}
interface PlaybackWriter {
  currentTime: number;
  muted: boolean;
  volume: number;
  playbackRate: number;
  readonly duration: number;
  play(): void;
  pause(): void;
}

export function captureVideoPlayback(
  player: PlaybackReader,
  intendedPlaying = player.playing,
): VideoPlaybackSnapshot {
  return {
    currentTime: Number.isFinite(player.currentTime)
      ? Math.max(0, player.currentTime)
      : 0,
    playing: intendedPlaying,
    muted: player.muted,
    volume: Number.isFinite(player.volume)
      ? Math.min(1, Math.max(0, player.volume))
      : 1,
    playbackRate:
      Number.isFinite(player.playbackRate) && player.playbackRate > 0
        ? player.playbackRate
        : 1,
  };
}

/** Call after the replacement has loaded, so seeking works on native and web. */
export function restoreVideoPlayback(
  player: PlaybackWriter,
  snapshot: VideoPlaybackSnapshot,
) {
  player.muted = snapshot.muted;
  player.volume = snapshot.volume;
  player.playbackRate = snapshot.playbackRate;
  player.currentTime =
    Number.isFinite(player.duration) && player.duration > 0
      ? Math.min(snapshot.currentTime, player.duration)
      : snapshot.currentTime;
  if (snapshot.playing) player.play();
  else player.pause();
}
