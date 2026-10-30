import {
  Permission,
  Role,
  type Client as NativeClient,
} from "react-native-appwrite";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { client } from "./appwrite";
import type { MediaUploadOptions } from "./media";
import type { UploadSource } from "./uploadSource";
import { uploadAppwriteChunks, uploadResponse } from "./appwriteUploadChunks";

/** Native multipart parts use temporary five MiB disk slices, never a whole video in JS. */
export async function uploadFile(
  fileId: string,
  uri: string,
  mime: string,
  name: string,
  size: number,
  userId: string,
  options: MediaUploadOptions = {},
  prepared?: UploadSource,
) {
  if (!FileSystem.cacheDirectory)
    throw new Error("Media storage is unavailable on this device.");
  const path = prepared?.uri || uri;
  const nativeClient = client as unknown as NativeClient;
  const endpoint = `${nativeClient.config.endpoint.replace(/\/$/, "")}/storage/buckets/circle-media/files`;
  const request = async (
    method: string,
    url: string,
    extraHeaders: Record<string, string>,
    body?: FormData,
  ) => {
    const response = await fetch(url, {
      method,
      credentials: "include",
      signal: options.signal,
      redirect: "error",
      headers: {
        ...nativeClient.getHeaders(),
        Origin: `appwrite-${Platform.OS}://${nativeClient.config.platform}`,
        accept: "application/json",
        ...extraHeaders,
      },
      body,
    });
    return uploadResponse(response);
  };
  await uploadAppwriteChunks({
    fileId,
    size,
    signal: options.signal,
    onProgress: options.onProgress,
    read: async (offset, length) => {
      const encoded = await FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.Base64,
        position: offset,
        length,
      });
      const temporary = `${FileSystem.cacheDirectory}circle-upload-part-${fileId}-${offset}`;
      try {
        await FileSystem.writeAsStringAsync(temporary, encoded, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return {
          value: { uri: temporary, name, type: mime },
          release: () =>
            FileSystem.deleteAsync(temporary, { idempotent: true }),
        };
      } catch (error) {
        await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(
          () => {},
        );
        throw error;
      }
    },
    send: (file, offset, length) => {
      const body = new FormData();
      body.append("fileId", fileId);
      // React Native FormData supports a file URI; its DOM declaration does not describe it.
      body.append("file", file as unknown as Blob);
      body.append("permissions[]", Permission.read(Role.user(userId)));
      body.append("permissions[]", Permission.delete(Role.user(userId)));
      const headers: Record<string, string> = {
        "content-range": `bytes ${offset}-${offset + length - 1}/${size}`,
      };
      if (offset > 0) headers["x-appwrite-id"] = fileId;
      return request("POST", endpoint, headers, body);
    },
    inspect: async () => {
      try {
        return await request(
          "GET",
          `${endpoint}/${encodeURIComponent(fileId)}`,
          {},
        );
      } catch (error) {
        if ((error as { code?: number }).code === 404) return null;
        throw error;
      }
    },
  });
}
