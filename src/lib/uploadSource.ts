import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
export interface UploadSource {
  size: number;
  contentType?: string;
  blob?: Blob;
  uri?: string;
  read(start: number, length: number): Promise<ArrayBuffer>;
  close?(): Promise<void>;
}

/** Browser Blob slices and native disk slices keep large videos out of JS memory. */
export async function openUploadSource(uri: string): Promise<UploadSource> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    if (!response.ok)
      throw new Error(
        "This media file could not be read. Please select it again.",
      );
    const blob = await response.blob();
    return {
      size: blob.size,
      blob,
      contentType:
        blob.type || response.headers.get("Content-Type") || undefined,
      read: (start, length) => blob.slice(start, start + length).arrayBuffer(),
    };
  }
  let path = uri;
  let temporary = false;
  if (uri.startsWith("content:")) {
    if (!FileSystem.cacheDirectory)
      throw new Error("Media storage is unavailable on this device.");
    path = `${FileSystem.cacheDirectory}circle-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await FileSystem.copyAsync({ from: uri, to: path });
    temporary = true;
  }
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists || info.isDirectory) {
    if (temporary) await FileSystem.deleteAsync(path, { idempotent: true });
    throw new Error(
      "This media file could not be read. Please select it again.",
    );
  }
  return {
    size: info.size,
    uri: path,
    read: async (start, length) => {
      const encoded = await FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.Base64,
        position: start,
        length,
      });
      const decoded = atob(encoded);
      const bytes = new Uint8Array(decoded.length);
      for (let index = 0; index < decoded.length; index++)
        bytes[index] = decoded.charCodeAt(index);
      return bytes.buffer;
    },
    close: temporary
      ? () => FileSystem.deleteAsync(path, { idempotent: true })
      : undefined,
  };
}
