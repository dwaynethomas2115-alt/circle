import { Permission, Role } from "appwrite";
import { client } from "./appwrite";
import type { MediaUploadOptions } from "./media";
import type { UploadSource } from "./uploadSource";
import { uploadAppwriteChunks, uploadResponse } from "./appwriteUploadChunks";

/** Browser File slices preserve the original Blob without a full ArrayBuffer copy. */
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
  const blob = prepared?.blob || (await (await fetch(uri)).blob());
  if (blob.size !== size)
    throw new Error("The selected file changed. Please choose it again.");
  const endpoint = `${client.config.endpoint.replace(/\/$/, "")}/storage/buckets/circle-media/files`;
  const request = async (
    method: string,
    url: string,
    headers: Record<string, string>,
    params: Record<string, unknown> = {},
  ) => {
    const preparedRequest = client.prepareRequest(
      method,
      new URL(url),
      headers,
      params,
    );
    const response = await fetch(preparedRequest.uri, {
      ...preparedRequest.options,
      signal: options.signal,
      redirect: "error",
    });
    return uploadResponse(response);
  };
  await uploadAppwriteChunks({
    fileId,
    size,
    signal: options.signal,
    onProgress: options.onProgress,
    read: async (offset, length) => ({
      value: new File([blob.slice(offset, offset + length)], name, {
        type: mime,
      }),
    }),
    send: (file, offset, length) =>
      request(
        "post",
        endpoint,
        {
          "content-type": "multipart/form-data",
          accept: "application/json",
          "content-range": `bytes ${offset}-${offset + length - 1}/${size}`,
          ...(offset > 0 ? { "x-appwrite-id": fileId } : {}),
        },
        {
          fileId,
          file,
          permissions: [
            Permission.read(Role.user(userId)),
            Permission.delete(Role.user(userId)),
          ],
        },
      ),
    inspect: async () => {
      try {
        return await request(
          "get",
          `${endpoint}/${encodeURIComponent(fileId)}`,
          { accept: "application/json" },
        );
      } catch (error) {
        if ((error as { code?: number }).code === 404) return null;
        throw error;
      }
    },
  });
}
