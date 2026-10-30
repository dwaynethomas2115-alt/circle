import type { UploadProgress } from "./media";

/** Appwrite's upload protocol uses five MiB parts, sent sequentially here. */
export const APPWRITE_CHUNK_BYTES = 5 * 1024 * 1024;
export interface UploadedFile {
  $id: string;
  sizeOriginal: number;
  chunksUploaded: number;
  chunksTotal: number;
}
interface Options<T> {
  fileId: string;
  size: number;
  read(
    offset: number,
    length: number,
  ): Promise<{ value: T; release?(): Promise<void> }>;
  send(value: T, offset: number, length: number): Promise<UploadedFile>;
  inspect(): Promise<UploadedFile | null>;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  retryDelay?: (attempt: number) => Promise<void>;
}

export function checkUploadCanceled(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new Error("Upload canceled. Your draft is still here.");
}
export function appwriteUploadError(cause: unknown): Error {
  const value = cause as { code?: number; message?: string; type?: string };
  const message = `${value?.message || ""} ${value?.type || ""}`;
  if (
    value?.code === 413 ||
    /file.*(?:large|size)|storage_file.*(?:large|size)|maximum.*size|limit.*file|file.*limit/i.test(
      message,
    )
  )
    return new Error(
      "This file exceeds your Appwrite storage plan or bucket upload limit. Check the maximum file size in Storage, or choose a smaller file.",
    );
  if (value?.code === 507 || /quota|storage.*full/i.test(message))
    return new Error(
      "Your Appwrite storage is full. Free some space or check your storage plan, then try again.",
    );
  if (value?.code === 401 || value?.code === 403)
    return new Error(
      "Your upload permission changed. Sign in again before sharing this file.",
    );
  return cause instanceof Error
    ? cause
    : new Error(
        "The upload could not finish. Your draft is still here; please try again.",
      );
}
export async function uploadResponse(
  response: Response,
): Promise<UploadedFile> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      typeof data?.message === "string"
        ? data.message
        : "The upload could not finish.",
    ) as Error & { code: number; type?: string };
    error.code = response.status;
    error.type = typeof data?.type === "string" ? data.type : undefined;
    throw error;
  }
  const fallback = response.headers.get("X-Fallback-Cookies");
  if (fallback && typeof window !== "undefined" && window.localStorage)
    window.localStorage.setItem("cookieFallback", fallback);
  return data as UploadedFile;
}
function confirmedOffset(file: UploadedFile, id: string, size: number): number {
  if (
    !file ||
    file.$id !== id ||
    file.sizeOriginal !== size ||
    !Number.isInteger(file.chunksUploaded) ||
    !Number.isInteger(file.chunksTotal) ||
    file.chunksTotal !== Math.ceil(size / APPWRITE_CHUNK_BYTES) ||
    file.chunksUploaded < 0 ||
    file.chunksUploaded > file.chunksTotal
  )
    throw new Error(
      "The upload server returned an unexpected file. Please try again.",
    );
  return Math.min(size, file.chunksUploaded * APPWRITE_CHUNK_BYTES);
}

export async function uploadAppwriteChunks<T>(
  options: Options<T>,
): Promise<void> {
  const { size, signal } = options;
  if (!Number.isSafeInteger(size) || size <= 0)
    throw new Error("This file is empty or could not be read.");
  let offset = 0,
    retries = 0;
  options.onProgress?.({ uploaded: 0, total: size });
  while (offset < size) {
    checkUploadCanceled(signal);
    const length = Math.min(APPWRITE_CHUNK_BYTES, size - offset);
    const chunk = await options.read(offset, length);
    try {
      checkUploadCanceled(signal);
      const file = await options.send(chunk.value, offset, length);
      const confirmed = confirmedOffset(file, options.fileId, size);
      if (confirmed !== offset + length)
        throw new Error(
          "The upload server returned an unexpected position. Please try again.",
        );
      offset = confirmed;
      retries = 0;
      options.onProgress?.({ uploaded: offset, total: size });
    } catch (cause) {
      checkUploadCanceled(signal);
      const status = (cause as { code?: number })?.code || 0;
      if (
        (status > 0 && status < 500 && ![408, 409, 429].includes(status)) ||
        ++retries > 3
      )
        throw appwriteUploadError(cause);
      await (
        options.retryDelay ||
        ((attempt) =>
          new Promise<void>((resolve) => setTimeout(resolve, attempt * 1000)))
      )(retries);
      checkUploadCanceled(signal);
      try {
        const current = await options.inspect();
        if (current) {
          const confirmed = confirmedOffset(current, options.fileId, size);
          if (confirmed < offset)
            throw new Error(
              "The upload server lost its saved position. Please try again.",
            );
          if (confirmed > offset) retries = 0;
          offset = confirmed;
          options.onProgress?.({ uploaded: offset, total: size });
        }
      } catch (inspectCause) {
        const code = (inspectCause as { code?: number })?.code;
        if (code && code !== 404 && code < 500)
          throw appwriteUploadError(inspectCause);
      }
    } finally {
      await chunk.release?.().catch(() => {});
    }
  }
  checkUploadCanceled(signal);
}
