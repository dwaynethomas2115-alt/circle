import { Account, Client, TablesDB, Storage, Tokens } from "node-appwrite";
import {
  execute,
  recordTheme,
  failTheme,
  ThemeError,
  type Identity,
  type ThemeFailure,
} from "./domain";
import { hydrateMedia, sealUpload, type MediaServices } from "./media";
import { requestSchema } from "./schema";
import { generateTheme, AIError } from "./ai";
import {
  storeWallpaper,
  signWallpaper,
  WALLPAPER_BUCKET,
  type WallpaperServices,
} from "./wallpaper";
import { Repository, type Database } from "./repository";
import type { AppState, Result } from "../../src/types";
export interface Context {
  req: { headers: Record<string, string | undefined>; bodyJson: unknown };
  res: { json(body: object, status?: number): unknown };
  error(message: string): void;
}
export interface Dependencies {
  verifyIdentity(jwt: string): Promise<Identity>;
  media?: MediaServices;
  wallpaper?: WallpaperServices;
  generateWallpaper?: typeof generateTheme;
  db: Database;
}
export default async function main(
  { req, res, error }: Context,
  injected?: Dependencies,
) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT,
    project = process.env.APPWRITE_FUNCTION_PROJECT_ID,
    databaseId = process.env.CIRCLE_DATABASE_ID;
  const jwt = req.headers["x-appwrite-user-jwt"],
    key = req.headers["x-appwrite-key"];
  if (!jwt) return res.json({ error: "Sign in to continue." }, 401);
  if (!endpoint || !project || !databaseId || !key)
    return res.json(
      { error: "Circle's Appwrite Function is not configured." },
      503,
    );
  const client = () => new Client().setEndpoint(endpoint).setProject(project);
  let identity: Identity;
  try {
    identity = injected
      ? await injected.verifyIdentity(jwt)
      : await new Account(client().setJWT(jwt)).get();
  } catch {
    return res.json(
      { error: "Your Appwrite session has expired. Sign in again." },
      401,
    );
  }
  const repository = new Repository(
    injected?.db ?? new TablesDB(client().setKey(key)),
    databaseId,
  );
  const media = injected?.media ?? {
    storage: new Storage(client().setKey(key)),
    tokens: new Tokens(client().setKey(key)),
  };
  const wallpaper = injected?.wallpaper ?? {
    storage: new Storage(client().setKey(key)),
    tokens: new Tokens(client().setKey(key)),
  };
  try {
    if (Buffer.byteLength(JSON.stringify(req.bodyJson) || "") > 24000)
      return res.json({ error: "Request is too large." }, 413);
    const parsed = requestSchema.safeParse(req.bodyJson);
    if (!parsed.success)
      throw new Error(
        "Invalid Circle request. Please check the fields and attachment format.",
      );
    const request = parsed.data;
    if (request.kind === "prepareTheme" && !process.env.OPENAI_API_KEY)
      throw new ThemeError(
        "AI wallpapers need a server-side OpenAI API key. Ask the app owner to connect OpenAI.",
        503,
        "provider_configuration",
      );
    if (request.kind === "themeWallpaper") {
      const authorized = await repository.read(identity, request);
      const fileId = (authorized.data as Result).id;
      if (!fileId) throw new Error("Wallpaper unavailable.");
      return res.json({
        data: await signWallpaper(
          wallpaper,
          fileId,
          process.env.CIRCLE_PUBLIC_ENDPOINT || endpoint,
          project,
        ),
      });
    }
    const result =
      request.kind === "snapshot" ||
      request.kind === "features" ||
      request.kind === "themeResult"
        ? await repository.read(identity, request)
        : await repository.mutate(identity, request, async (store) => {
            if (request.kind === "finishUpload")
              await sealUpload(media, store, identity, request.fileId);
            const outcome = execute(store, identity, request);
            if (
              request.kind === "action" &&
              request.action.type === "markRead" &&
              store.app.notifications.length === 80 &&
              "ok" in outcome.data &&
              outcome.data.ok
            )
              outcome.data.code = "more_unread";
            return outcome;
          });
    if (request.kind === "cancelUpload") {
      // Delete only after a confirmed transaction commits the owned cancellation
      // tombstone. A conflicting finish/upload commit must never lose its file.
      try {
        await media.storage.deleteFile({
          bucketId: "circle-media",
          fileId: request.fileId,
        });
      } catch (cause) {
        if ((cause as { code?: number }).code !== 404) throw cause;
      }
    }
    if (request.kind === "generateTheme") {
      const requestId = (result.data as Result).id;
      if (!requestId)
        throw new Error("Could not reserve wallpaper generation.");
      // Only the transaction that changes prepared -> processing may call AI.
      // Re-dispatching a prepared ID after a lost HTTP response cannot charge twice.
      if ((result.data as Result).code !== "theme_claimed")
        return res.json({ data: { ok: true } });
      let completed = false,
        uncertainCompletion = false,
        uploadStarted = false;
      let failure: ThemeFailure | undefined;
      try {
        if (!process.env.OPENAI_API_KEY)
          throw new ThemeError(
            "AI wallpapers need a server-side OpenAI API key. Ask the app owner to connect OpenAI.",
            503,
            "provider_configuration",
          );
        const generated = await (injected?.generateWallpaper ?? generateTheme)(
          request.prompt.trim(),
          process.env.OPENAI_API_KEY!,
        );
        const theme = {
          ...generated.theme,
          wallpaperPath: `${request.circleId}/${requestId}.webp`,
        };
        uploadStarted = true;
        await storeWallpaper(wallpaper, requestId, generated.image);
        const complete = () =>
          repository.mutate(identity, request, async (store) => ({
            store: recordTheme(
              store,
              identity,
              request.circleId,
              theme,
              requestId,
            ),
            data: theme,
          }));
        try {
          await complete();
          completed = true;
          return res.json({ data: theme });
        } catch (cause) {
          if (cause instanceof ThemeError) throw cause; // The domain rejected before commit.
          uncertainCompletion = true;
        }
        // Appwrite may commit a transaction before its HTTP response is lost.
        // Confirm and retry the exact completion, never the chargeable AI call.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            if (
              await repository.confirmTheme(identity, request, requestId, theme)
            ) {
              completed = true;
              return res.json({ data: theme });
            }
          } catch {
            /* Keep the private artifact if DB status remains unknown. */
          }
          if (attempt === 0) {
            try {
              await complete();
              completed = true;
              return res.json({ data: theme });
            } catch {
              /* One bounded idempotent retry; do not delete on ambiguity. */
            }
          }
        }
        throw new ThemeError(
          "Your wallpaper was created, but its preview could not be confirmed. Your current theme is unchanged. Refresh before generating another; this wallpaper may already count toward your daily allowance.",
          502,
          "theme_completion_unconfirmed",
        );
      } catch (cause) {
        failure = themeFailure(cause);
        throw cause;
      } finally {
        if (!completed) {
          if (!uncertainCompletion && uploadStarted)
            await wallpaper.storage
              .deleteFile({ bucketId: WALLPAPER_BUCKET, fileId: requestId })
              .catch(() => undefined);
          await repository
            .mutate(identity, request, async (store) => ({
              store: failTheme(
                store,
                identity,
                requestId,
                failure,
                uncertainCompletion,
              ),
              data: { ok: true },
            }))
            .catch(() => undefined);
        }
      }
    }
    return res.json({
      data:
        request.kind === "snapshot"
          ? await hydrateMedia(
              result.data as AppState,
              media,
              result.store,
              process.env.CIRCLE_PUBLIC_ENDPOINT || endpoint,
              project,
            )
          : result.data,
    });
  } catch (cause) {
    if (cause instanceof ThemeError || cause instanceof AIError)
      return res.json(
        {
          error: cause.message,
          code: cause.code,
          ...(cause.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: cause.retryAfterSeconds }
            : {}),
          ...(cause instanceof ThemeError && cause.resetAt
            ? { resetAt: cause.resetAt }
            : {}),
        },
        cause.status,
      );
    if ((cause as { code?: number }).code === 409)
      return res.json(
        { error: "Circle changed during your request. Please retry." },
        409,
      );
    if (cause instanceof Error && !("code" in cause))
      return res.json({ error: cause.message }, 400);
    error(
      "Appwrite operation failed; check normalized schema, function scopes and transaction support.",
    );
    return res.json(
      {
        error:
          "Circle's Appwrite storage is unavailable. Check the deployment and retry.",
      },
      503,
    );
  }
}

/** Persist only intentional user-facing metadata, never arbitrary provider/SDK output. */
function themeFailure(cause: unknown): ThemeFailure {
  if (cause instanceof ThemeError || cause instanceof AIError)
    return {
      error: cause.message,
      code: cause.code,
      responseStatus: cause.status,
      ...(cause.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: cause.retryAfterSeconds }
        : {}),
      ...(cause instanceof ThemeError && cause.resetAt
        ? { resetAt: cause.resetAt }
        : {}),
    };
  if ((cause as { code?: number })?.code === 409)
    return {
      error: "Circle changed during your request. Please retry.",
      code: "theme_conflict",
      responseStatus: 409,
    };
  return {
    error: "The wallpaper could not be created. Please try again.",
    code: "theme_generation_failed",
    responseStatus: 502,
  };
}
