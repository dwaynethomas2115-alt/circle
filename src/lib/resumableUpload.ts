/** A bounded-memory TUS uploader. Supabase requires 6 MiB chunks. */
export const UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024;
export interface UploadSource {
  size: number;
  contentType?: string;
  read(start: number, length: number): Promise<ArrayBuffer>;
  close?(): Promise<void>;
}
export interface UploadProgress {
  uploaded: number;
  total: number;
}
interface ResumableOptions {
  endpoint: string;
  bucket: string;
  path: string;
  contentType: string;
  source: UploadSource;
  headers: () => Promise<Record<string, string>>;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  /** Injected only by tests; production uses a short bounded retry delay. */
  retryDelay?: (attempt: number) => Promise<void>;
}

export function storageUploadError(status: number, detail = "") {
  if (status === 507 || /storage.*quota|quota.*exceed/i.test(detail))
    return new Error(
      "Your storage is full. Free some space or check your storage plan, then try again.",
    );
  if (
    status === 413 ||
    /maximum.*size|file.*size.*exceed|exceed.*(?:size|limit)|payload too large/i.test(
      detail,
    )
  )
    return new Error(
      "Your storage provider’s upload limit is smaller than this file. Check your storage plan and maximum upload size, or choose a smaller file.",
    );
  if (status === 401 || status === 403)
    return new Error(
      "Your upload permission changed. Sign in again and check that you still belong to this Circle.",
    );
  return new Error(
    "The upload could not finish. Your draft is still here; check your connection and try again.",
  );
}

function checkCanceled(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new Error("Upload canceled. Your draft is still here.");
}
function metadata(value: string) {
  // TUS metadata is base64; encode Unicode object names correctly too.
  const encoded = encodeURIComponent(value).replace(
    /%([0-9A-F]{2})/g,
    (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)),
  );
  return btoa(encoded);
}
function readOffset(response: Response, maximum: number): number {
  const raw = response.headers.get("Upload-Offset");
  const offset = raw !== null && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > maximum)
    throw new Error(
      "The upload server returned an invalid position. Please try again.",
    );
  return offset;
}
async function errorFor(response: Response) {
  return storageUploadError(
    response.status,
    (await response.text().catch(() => "")).slice(0, 2000),
  );
}
function retryable(status: number) {
  return (
    status === 408 ||
    status === 409 ||
    status === 423 ||
    status === 429 ||
    status >= 500
  );
}

export async function resumableUpload(
  options: ResumableOptions,
): Promise<void> {
  const { endpoint, source, signal, headers, onProgress } = options;
  checkCanceled(signal);
  if (!Number.isSafeInteger(source.size) || source.size <= 0)
    throw new Error(
      "This file is empty or could not be read. Please choose it again.",
    );
  const baseHeaders = async () => ({
    ...(await headers()),
    "Tus-Resumable": "1.0.0",
  });
  const created = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    signal,
    headers: {
      ...(await baseHeaders()),
      "Upload-Length": String(source.size),
      "x-upsert": "false",
      "Upload-Metadata": Object.entries({
        bucketName: options.bucket,
        objectName: options.path,
        contentType: options.contentType,
        cacheControl: "3600",
      })
        .map(([key, value]) => `${key} ${metadata(value)}`)
        .join(","),
    },
  });
  if (!created.ok) throw await errorFor(created);
  const location = created.headers.get("Location");
  if (!location)
    throw new Error(
      "The upload server did not start the upload. Please try again.",
    );
  const uploadUrl = new URL(location, endpoint);
  // Never forward the account token to a host supplied by an untrusted response.
  if (
    uploadUrl.origin !== new URL(endpoint).origin ||
    !uploadUrl.pathname.startsWith(
      `${new URL(endpoint).pathname.replace(/\/$/, "")}/`,
    ) ||
    uploadUrl.username ||
    uploadUrl.password
  )
    throw new Error("The upload server returned an unexpected address.");
  let offset = created.headers.has("Upload-Offset")
    ? readOffset(created, source.size)
    : 0;
  onProgress?.({ uploaded: offset, total: source.size });
  let retries = 0;
  while (offset < source.size) {
    checkCanceled(signal);
    const length = Math.min(UPLOAD_CHUNK_BYTES, source.size - offset);
    const chunk = await source.read(offset, length);
    if (chunk.byteLength !== length)
      throw new Error(
        "The selected file changed or could not be read. Please select it again.",
      );
    try {
      const response = await fetch(uploadUrl.toString(), {
        method: "PATCH",
        redirect: "error",
        signal,
        headers: {
          ...(await baseHeaders()),
          "Content-Type": "application/offset+octet-stream",
          "Upload-Offset": String(offset),
        },
        body: chunk,
      });
      if (!response.ok) {
        if (!retryable(response.status))
          throw { terminal: await errorFor(response) };
        throw new Error("Retry upload");
      }
      const next = readOffset(response, source.size);
      if (next !== offset + length)
        throw {
          terminal: new Error(
            "The upload server returned an unexpected position. Please try again.",
          ),
        };
      offset = next;
      retries = 0;
      onProgress?.({ uploaded: offset, total: source.size });
    } catch (cause) {
      checkCanceled(signal);
      if (cause && typeof cause === "object" && "terminal" in cause)
        throw cause.terminal;
      if (++retries > 3) throw storageUploadError(0);
      await (
        options.retryDelay ||
        ((attempt: number) =>
          new Promise<void>((resolve) =>
            setTimeout(resolve, Math.min(5000, attempt * 1000)),
          ))
      )(retries);
      checkCanceled(signal);
      // A lost PATCH response may have committed its chunk. Ask before resending.
      try {
        const head = await fetch(uploadUrl.toString(), {
          method: "HEAD",
          redirect: "error",
          signal,
          headers: await baseHeaders(),
        });
        if (head.ok) {
          const confirmed = readOffset(head, source.size);
          if (confirmed < offset)
            throw {
              terminal: new Error(
                "The upload server lost its saved position. Please try again.",
              ),
            };
          if (confirmed > offset) retries = 0;
          offset = confirmed;
          onProgress?.({ uploaded: offset, total: source.size });
        } else if (!retryable(head.status))
          throw { terminal: await errorFor(head) };
      } catch (headCause) {
        checkCanceled(signal);
        if (
          headCause &&
          typeof headCause === "object" &&
          "terminal" in headCause
        )
          throw headCause.terminal;
      }
    }
  }
}
