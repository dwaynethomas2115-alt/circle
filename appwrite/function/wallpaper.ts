import { InputFile } from "node-appwrite/file";
import { Query, type Storage, type Tokens } from "node-appwrite";
import { ThemeError } from "./domain";

export const WALLPAPER_BUCKET = "circle-media";
export const LEGACY_WALLPAPER_BUCKET = "circle-wallpapers";
const MAX_WALLPAPER_BYTES = 10_485_760;
const UUID = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
export interface WallpaperArtifact {
  bucketId: string;
  fileId: string;
}
export interface WallpaperServices {
  storage: Pick<Storage, "createFile" | "getFile" | "deleteFile" | "listFiles">;
  tokens: Pick<Tokens, "createFileToken">;
}

/** Disjoint from ordinary upload UUIDs; within Appwrite's 36-character ID limit. */
export function wallpaperFileId(requestId: string): string {
  if (!new RegExp(`^${UUID}$`, "i").test(requestId) || requestId.length !== 36)
    throw new ThemeError(
      "Wallpaper unavailable.",
      400,
      "wallpaper_unavailable",
    );
  return `wp_${requestId.replace(/-/g, "").toLowerCase()}`;
}

/** The logical suffix binds the bucket and file namespace. Never probe another bucket as a fallback. */
export function wallpaperLocation(
  path: string,
): WallpaperArtifact & { mimeType: string } {
  const match = new RegExp(
    `^[A-Za-z0-9_-]{1,128}/(${UUID})\\.(jpg|webp)$`,
    "i",
  ).exec(path);
  if (!match || match[0] !== path)
    throw new ThemeError(
      "Wallpaper unavailable.",
      400,
      "wallpaper_unavailable",
    );
  const requestId = match[1].toLowerCase();
  return match[2].toLowerCase() === "jpg"
    ? {
        bucketId: WALLPAPER_BUCKET,
        fileId: wallpaperFileId(requestId),
        mimeType: "image/jpeg",
      }
    : {
        bucketId: LEGACY_WALLPAPER_BUCKET,
        fileId: requestId,
        mimeType: "image/webp",
      };
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
        "Wallpaper generation is paused because the Circle media bucket is missing. The app owner can check the Appwrite storage setup.",
        503,
        "wallpaper_storage_missing",
      );
    throw new ThemeError(
      "Wallpaper generation is paused because Circle media storage is unavailable. The app owner can check the Appwrite storage setup and Function access.",
      503,
      "wallpaper_storage_unavailable",
    );
  }
}

export async function storeWallpaper(
  services: WallpaperServices,
  requestId: string,
  image: Uint8Array,
): Promise<WallpaperArtifact> {
  if (
    image.length < 20 ||
    image.length > MAX_WALLPAPER_BYTES ||
    image[0] !== 0xff ||
    image[1] !== 0xd8 ||
    image[2] !== 0xff ||
    image[image.length - 2] !== 0xff ||
    image[image.length - 1] !== 0xd9
  )
    throw new ThemeError(
      "The generated wallpaper is not a valid JPEG image.",
      502,
      "wallpaper_image_invalid",
    );
  const artifact = {
    bucketId: WALLPAPER_BUCKET,
    fileId: wallpaperFileId(requestId),
  };
  let created = false;
  try {
    const file = await services.storage.createFile({
      ...artifact,
      file: InputFile.fromBuffer(image, "wallpaper.jpg"),
      permissions: [],
    });
    if (file.$id !== artifact.fileId)
      throw new Error("Unexpected wallpaper file identity");
    created = true;
    if (
      !Array.isArray(file.$permissions) ||
      file.$permissions.length ||
      file.mimeType !== "image/jpeg" ||
      file.sizeOriginal !== image.length ||
      !Number.isInteger(file.chunksTotal) ||
      file.chunksTotal < 1 ||
      !Number.isInteger(file.chunksUploaded) ||
      file.chunksUploaded < 1 ||
      file.chunksTotal !== file.chunksUploaded
    )
      throw new Error("Invalid stored wallpaper metadata");
    return artifact;
  } catch {
    // A create conflict or lost response does not prove ownership. Preserve any
    // ambiguous object rather than deleting a pre-existing file in this bucket.
    if (created)
      await services.storage.deleteFile(artifact).catch(() => undefined);
    throw new ThemeError(
      "Your Circle’s storage could not save the wallpaper. Check the Appwrite storage allowance, then try again. This is separate from your daily wallpaper allowance.",
      507,
      "storage_limit",
    );
  }
}

export async function signWallpaper(
  services: WallpaperServices,
  wallpaperPath: string,
  endpoint: string,
  project: string,
) {
  const location = wallpaperLocation(wallpaperPath);
  let file;
  try {
    file = await services.storage.getFile({
      bucketId: location.bucketId,
      fileId: location.fileId,
    });
  } catch {
    throw new ThemeError(
      "This wallpaper is unavailable. Ask the Circle owner to generate a new preview.",
      503,
      "wallpaper_unavailable",
    );
  }
  if (
    file.$id !== location.fileId ||
    !Array.isArray(file.$permissions) ||
    file.$permissions.length ||
    file.mimeType !== location.mimeType ||
    file.sizeOriginal <= 0 ||
    file.sizeOriginal > MAX_WALLPAPER_BYTES ||
    !Number.isInteger(file.chunksTotal) ||
    file.chunksTotal < 1 ||
    !Number.isInteger(file.chunksUploaded) ||
    file.chunksUploaded < 1 ||
    file.chunksTotal !== file.chunksUploaded
  )
    throw new ThemeError(
      "This wallpaper is unavailable. Ask the Circle owner to generate a new preview.",
      503,
      "wallpaper_unavailable",
    );
  const expiresAt = Date.now() + 60_000;
  const token = await services.tokens.createFileToken({
    bucketId: location.bucketId,
    fileId: location.fileId,
    expire: new Date(expiresAt).toISOString(),
  });
  return {
    url: `${endpoint.replace(/\/$/, "")}/storage/buckets/${location.bucketId}/files/${encodeURIComponent(location.fileId)}/view?${new URLSearchParams({ project, token: token.secret })}`,
    expiresAt,
  };
}
