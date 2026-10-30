import { Permission, Role, type Storage, type Tokens } from "node-appwrite";
import type { AppState } from "../../src/types";
import type { Identity, Store } from "./domain";
export const BUCKET = "circle-media";
export const MAX_FILE_BYTES = 50_000_000;
export interface MediaServices {
  storage: Pick<Storage, "getFile" | "updateFile">;
  tokens: Pick<Tokens, "createFileToken">;
}
/** Refuse unreserved files, another uploader's file, public ACLs and incomplete uploads. */
export async function sealUpload(
  services: MediaServices,
  store: Store,
  identity: Identity,
  fileId: string,
) {
  const reservation = store.uploads?.[fileId];
  if (
    !reservation ||
    reservation.owner !== identity.$id ||
    (!reservation.ready && reservation.createdAt < Date.now() - 86400000)
  )
    throw new Error("Upload unavailable.");
  const file = await services.storage.getFile({ bucketId: BUCKET, fileId });
  const expected = [
    Permission.read(Role.user(identity.$id)),
    Permission.delete(Role.user(identity.$id)),
  ];
  if (
    file.$permissions.some((p) => !expected.includes(p)) ||
    (file.$permissions.length !== 0 &&
      (file.$permissions.length !== expected.length ||
        !expected.every((p) => file.$permissions.includes(p))))
  )
    throw new Error(
      "Upload permissions are invalid. Upload this file again privately.",
    );
  const allowed =
    reservation.mediaType === "image"
      ? ["image/jpeg"]
      : ["video/mp4", "video/quicktime"];
  if (
    !allowed.includes(file.mimeType) ||
    file.sizeOriginal <= 0 ||
    file.sizeOriginal > MAX_FILE_BYTES ||
    file.chunksUploaded !== file.chunksTotal
  )
    throw new Error(
      "The uploaded file is incomplete, too large, or has an unsupported format.",
    );
  // Removing direct owner access ensures membership removal also revokes future reads.
  // An interrupted transaction can safely retry sealing an already-private reservation.
  const sealed = await services.storage.updateFile({
    bucketId: BUCKET,
    fileId,
    permissions: [],
  });
  if (
    sealed.$permissions.length ||
    !allowed.includes(sealed.mimeType) ||
    sealed.sizeOriginal <= 0 ||
    sealed.sizeOriginal > MAX_FILE_BYTES ||
    sealed.chunksUploaded !== sealed.chunksTotal
  )
    throw new Error(
      "The file changed while its upload was being finalized. Upload it again.",
    );
}
/** Only receives the server-authorized snapshot, never the entire store. */
export async function hydrateMedia(
  app: AppState,
  services: MediaServices,
  store: Store,
  endpoint: string,
  project: string,
) {
  const next = structuredClone(app),
    urls = new Map<string, string>();
  const sign = async (value: string | undefined) => {
    if (!value?.startsWith("awfile:")) return value;
    if (urls.has(value)) return urls.get(value)!;
    const fileId = value.slice(7);
    if (!store.uploads?.[fileId]?.ready)
      throw new Error("A shared attachment is unavailable.");
    const token = await services.tokens.createFileToken({
      bucketId: BUCKET,
      fileId,
      expire: new Date(Date.now() + 60_000).toISOString(),
    });
    const url = `${endpoint.replace(/\/$/, "")}/storage/buckets/${BUCKET}/files/${encodeURIComponent(fileId)}/view?${new URLSearchParams({ project, token: token.secret })}`;
    urls.set(value, url);
    return url;
  };
  // Sequential signing prevents duplicate tokens for an attachment reused in the snapshot.
  for (const user of next.users) user.avatar = (await sign(user.avatar)) || "";
  for (const circle of next.circles) {
    circle.avatar = (await sign(circle.avatar)) || "";
    circle.cover = (await sign(circle.cover)) || "";
  }
  for (const post of next.posts) post.media = await sign(post.media);
  return next;
}
