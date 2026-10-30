import { Account, Client, TablesDB, Storage, Tokens } from "node-appwrite";
import { execute, recordTheme, type Identity } from "./domain";
import { hydrateMedia, sealUpload, type MediaServices } from "./media";
import { requestSchema } from "./schema";
import { generateTheme } from "./ai";
import { Repository, type Database } from "./repository";
import type { AppState } from "../../src/types";
export interface Context {
  req: { headers: Record<string, string | undefined>; bodyJson: unknown };
  res: { json(body: object, status?: number): unknown };
  error(message: string): void;
}
export interface Dependencies {
  verifyIdentity(jwt: string): Promise<Identity>;
  media?: MediaServices;
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
  try {
    if (Buffer.byteLength(JSON.stringify(req.bodyJson) || "") > 24000)
      return res.json({ error: "Request is too large." }, 413);
    const parsed = requestSchema.safeParse(req.bodyJson);
    if (!parsed.success)
      throw new Error(
        "Invalid Circle request. Please check the fields and attachment format.",
      );
    const request = parsed.data;
    if (request.kind === "generateTheme" && !process.env.OPENAI_API_KEY)
      throw new Error(
        "AI themes need a server-side OpenAI API key. Preset themes remain available.",
      );
    const result =
      request.kind === "snapshot" || request.kind === "features"
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
    if (request.kind === "generateTheme") {
      const theme = await generateTheme(
        request.prompt.trim(),
        process.env.OPENAI_API_KEY!,
      );
      await repository.mutate(identity, request, async (store) => ({
        store: recordTheme(store, identity, request.circleId, theme),
        data: theme,
      }));
      return res.json({ data: theme });
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
