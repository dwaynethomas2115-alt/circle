import { InputFile } from "node-appwrite/file";
import { Query, type Storage, type Tokens } from "node-appwrite";
import { ThemeError } from "./domain";
export const WALLPAPER_BUCKET = "circle-wallpapers";
export interface WallpaperServices {
  storage: Pick<Storage, "createFile" | "getFile" | "deleteFile" | "listFiles">;
  tokens: Pick<Tokens, "createFileToken">;
}
/** Read-only existence/access check before any chargeable generation work. */
export async function assertWallpaperStorage(services: WallpaperServices) {
  try {
    const result = await services.storage.listFiles({
      bucketId: WALLPAPER_BUCKET,
      queries: [Query.limit(1)],
      total: false,
    });
    if (!result || !Array.isArray(result.files))
      throw new Error("Wallpaper storage did not return a file list.");
  } catch (cause) {
    const failure = cause as { code?: unknown; type?: unknown } | null;
    if (failure?.code === 404 && failure.type === "storage_bucket_not_found")
      throw new ThemeError(
        "Wallpaper generation is paused because its private storage bucket is missing. The app owner can check the Appwrite storage setup.",
        503,
        "wallpaper_storage_missing",
      );
    throw new ThemeError(
      "Wallpaper generation is paused because its private storage is unavailable. The app owner can check the Appwrite storage setup and Function access.",
      503,
      "wallpaper_storage_unavailable",
    );
  }
}
export async function storeWallpaper(
  services: WallpaperServices,
  fileId: string,
  image: Uint8Array,
) {
  try {
    const file = await services.storage.createFile({
      bucketId: WALLPAPER_BUCKET,
      fileId,
      file: InputFile.fromBuffer(image, "wallpaper.webp"),
      permissions: [],
    });
    if (
      file.$permissions.length ||
      file.mimeType !== "image/webp" ||
      file.sizeOriginal !== image.length ||
      file.chunksTotal !== file.chunksUploaded
    )
      throw new Error("Invalid stored wallpaper metadata");
  } catch {
    throw new ThemeError(
      "Your Circle’s storage could not save the wallpaper. Check the Appwrite storage allowance, then try again. This is separate from your daily wallpaper allowance.",
      507,
      "storage_limit",
    );
  }
}
export async function signWallpaper(
  services: WallpaperServices,
  fileId: string,
  endpoint: string,
  project: string,
) {
  const file = await services.storage.getFile({
    bucketId: WALLPAPER_BUCKET,
    fileId,
  });
  if (
    file.$permissions.length ||
    file.mimeType !== "image/webp" ||
    file.sizeOriginal <= 0 ||
    file.sizeOriginal > 10_485_760 ||
    file.chunksTotal !== file.chunksUploaded
  )
    throw new ThemeError(
      "This wallpaper is unavailable. Ask the Circle owner to generate a new preview.",
      503,
      "wallpaper_unavailable",
    );
  const expiresAt = Date.now() + 60_000;
  const token = await services.tokens.createFileToken({
    bucketId: WALLPAPER_BUCKET,
    fileId,
    expire: new Date(expiresAt).toISOString(),
  });
  return {
    url: `${endpoint.replace(/\/$/, "")}/storage/buckets/${WALLPAPER_BUCKET}/files/${encodeURIComponent(fileId)}/view?${new URLSearchParams({ project, token: token.secret })}`,
    expiresAt,
  };
}
