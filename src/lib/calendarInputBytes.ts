import { File as NativeFile, Paths } from "expo-file-system";
import { assertCalendarLocalUri } from "./calendarInputValidation";

/** The native picker supplies a cache copy; this never downloads a remote URL. */
export async function readCalendarLocalBytes(
  uri: string,
  limit: number,
  _blob?: Blob,
): Promise<Uint8Array> {
  assertCalendarLocalUri(uri);
  const file = new NativeFile(uri);
  if (
    !file.exists ||
    !Number.isFinite(file.size) ||
    file.size < 1 ||
    file.size > limit
  )
    throw new Error(
      "This file is empty or exceeds the supported calendar attachment limit.",
    );
  const bytes = await file.bytes();
  if (!bytes.length || bytes.length > limit)
    throw new Error(
      "This file exceeds the supported calendar attachment limit.",
    );
  return bytes;
}

export async function discardCalendarPreparedImage(uri: string) {
  if (!uri.startsWith("file:")) return;
  try {
    new NativeFile(uri).delete();
  } catch {
    /* A disposable local preview may already be gone. */
  }
}

export async function discardCalendarPickedText(uri: string) {
  // Delete only this picker's disposable cache copy, never the original file.
  const cache = Paths.cache.uri.replace(/\/$/, "") + "/DocumentPicker/";
  if (!uri.startsWith(cache)) return;
  try {
    new NativeFile(uri).delete();
  } catch {
    /* The OS can purge cache copies itself. */
  }
}

export async function discardCalendarPickedPhoto(_uri: string) {
  /* Never delete the selected original photo. */
}
