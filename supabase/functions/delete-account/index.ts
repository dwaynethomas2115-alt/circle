/** Authenticated account deletion; deploy with Supabase Edge Functions.
 * The service role is read ONLY from Edge Function environment secrets.
 * Client supplies no user ID, paths, bucket, or credentials to this handler.
 */
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const reply = (status: number, value: object) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply(405, { error: "Use POST." });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!url || !serviceKey)
    return reply(503, { error: "Account deletion is not configured." });
  if (!authorization?.startsWith("Bearer "))
    return reply(401, { error: "Sign in to delete your account." });
  try {
    // Verify caller with Auth; never trust an unverified JWT payload or input ID.
    const userHeaders = {
      apikey: serviceKey,
      Authorization: authorization,
      "Content-Type": "application/json",
    };
    const verified = await fetch(`${url}/auth/v1/user`, {
      headers: userHeaders,
    });
    if (!verified.ok)
      return reply(401, { error: "Your session expired. Sign in again." });
    const user = (await verified.json()) as { id?: string };
    if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id))
      return reply(401, { error: "Invalid account." });
    const adminHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };
    // Query through caller's JWT, so owned_media_paths cannot enumerate another
    // user's objects. Repeated page zero handles >1000 objects after deletion.
    let previousPage = "";
    for (;;) {
      const listing = await fetch(
        `${url}/rest/v1/rpc/owned_media_paths?limit=1000`,
        { method: "POST", headers: userHeaders, body: "{}" },
      );
      if (!listing.ok)
        throw new Error("Could not inspect your uploaded media.");
      const objects = (await listing.json()) as {
        bucket_id: string;
        name: string;
      }[];
      if (!Array.isArray(objects)) throw new Error("Invalid media response.");
      if (!objects.length) break;
      const fingerprint = JSON.stringify(objects);
      if (fingerprint === previousPage)
        throw new Error("Media cleanup did not progress. Please retry later.");
      previousPage = fingerprint;
      for (const bucket of ["circle-media", "profile-avatars"]) {
        const paths = objects
          .filter((object) => object.bucket_id === bucket)
          .map((object) => object.name);
        // Validate the server-returned paths against the verified caller too.
        if (
          paths.some(
            (path) =>
              path.split("/")[bucket === "circle-media" ? 1 : 0] !== user.id,
          )
        )
          throw new Error("Media ownership validation failed.");
        for (let offset = 0; offset < paths.length; offset += 100) {
          const removal = await fetch(`${url}/storage/v1/object/${bucket}`, {
            method: "DELETE",
            headers: adminHeaders,
            body: JSON.stringify({
              prefixes: paths.slice(offset, offset + 100),
            }),
          });
          if (!removal.ok)
            throw new Error(
              "Could not remove your uploaded media. Please retry account deletion.",
            );
        }
      }
      if (
        objects.some(
          (object) =>
            !["circle-media", "profile-avatars"].includes(object.bucket_id),
        )
      )
        throw new Error("Unexpected media bucket.");
    }
    // SQL still authorizes the caller and refuses deletion while any of their
    // app media metadata remains, including a simultaneous upload race.
    const deletion = await fetch(`${url}/rest/v1/rpc/delete_account`, {
      method: "POST",
      headers: userHeaders,
      body: "{}",
    });
    if (!deletion.ok)
      throw new Error(
        "Account deletion could not finish. Please retry or contact support.",
      );
    return reply(200, { deleted: true });
  } catch (error) {
    // Do not log request headers, storage URLs, service key, or raw upstream errors.
    return reply(500, {
      error:
        error instanceof Error ? error.message : "Account deletion failed.",
    });
  }
});
