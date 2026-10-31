# Wallpapers in the existing media bucket

Dwayne approved using the existing Appwrite bucket for wallpapers. Circle now stores new wallpapers alongside account photos and videos in **`circle-media`**. Accounts, database records, existing file IDs, posts, and albums stay in place. Sharing a bucket does not share access: server checks still decide which person or Circle can read each file.

The implementation uses **JPEG** wallpapers because the existing bucket already accepts `jpg`, `mp4`, and `mov`. **No new bucket, extension change, permission change, plan upgrade, or data migration is required.** The earlier proposal to add WebP to this bucket is unnecessary. Wallpaper images use some of the same storage allowance as photos and videos.

## File routing and private access

| Item                              | New wallpaper                                                           | Existing legacy wallpaper                      |
| --------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| Logical path saved with the theme | `<CircleID>/<request UUID>.jpg`                                         | `<CircleID>/<request UUID>.webp`               |
| Storage bucket                    | `circle-media`                                                          | `circle-wallpapers`, only if it already exists |
| Physical file ID                  | `wp_` followed by the request UUID without hyphens, 35 characters total | The original request UUID                      |
| Format                            | JPEG / `image/jpeg`                                                     | WebP / `image/webp`                            |
| Application file-size ceiling     | 10,485,760 bytes                                                        | 10,485,760 bytes                               |

The `wp_` namespace separates wallpapers from ordinary reserved media uploads, whose IDs are UUIDs. Wallpaper files are created by the Function with empty file permissions. The bucket retains file security and its existing **create(users)** permission only; it has no bucket-wide read, update, or delete grant. Client uploads keep their existing owner-private upload/sealing process. Existing media is not renamed, moved, or reclassified.

A requesting current Circle owner/admin can obtain their own unapplied preview. After applying a theme, current Circle members can obtain its short-lived link. Another Circle, an outsider, or a removed member cannot obtain a new link. Previously issued links can remain valid until their 60-second expiry. The client validates the expected bucket and physical file ID for the saved logical path.

An existing `.webp` theme continues routing to the legacy bucket; the update neither creates that bucket nor migrates or deletes its contents. The normal provisioning contract now requires only `circle-media`.

The updated client declares JPEG support when reserving and starting generation. An older open browser tab receives a refresh-required message before a reservation or provider call, rather than paying to generate an image that its old client cannot display. The new client also rejects an older server during the free reservation step. Existing legacy wallpaper viewing remains available.

Regular upload cleanup operates on registered ordinary uploads. Server wallpaper files are not ordinary upload reservations and must be excluded from that cleanup namespace. Cleanup after a failed generation can remove only an artifact proven created by that job; an existing-file conflict or ambiguous creation response is not permission to delete a file. Ambiguous private artifacts and unused/replaced wallpapers may consume storage until an administrator performs separately reviewed cleanup. No automatic wallpaper cleanup is added by this change.

## Current verified status

Dot last confirmed active Appwrite deployment **`6ae5c5f6876bd6211b25`**, from **`b9ed85b7d8ed3982d9c3230d033275f49e1796d6`**, in the October 31, 2026 10:43 UTC handoff. That version contains stage-aware OpenAI errors and the storage preflight, but still expects the separate wallpaper bucket. The shared-bucket code in this update must be deployed before it can remove that requirement. These are supplied hosted facts, not a fresh dashboard check from this workspace.

The code redesign resolves the need for a second bucket. It does not establish that the live OpenAI key, text model, image model, or hosted generation works. The last reported text-model setting is **`OPENAI_THEME_MODEL=gpt-6-luna`**; preserve it unless Dwayne separately approves a change. No image-model/quality override was listed among Function-specific variables at Dot's last check, so the source defaults are `gpt-image-1` and `medium` unless another applicable setting overrides them. Their live availability remains unverified.

## Dot deployment steps

1. Confirm the approved GitHub commit containing this update, and fetch its exact `appwrite/function/main.js`, `package.json`, and `package-lock.json`. The committed `main.js` is bundled and does not need the rest of the repository at runtime. Dot's previously used one-time manual archive method is suitable.
2. Deploy those files to existing Appwrite project **`6ae3ee7000368dcb80e7`**, Function **`circle-api`**, API endpoint **`https://fra.cloud.appwrite.io/v1`**. Preserve **Node.js 22**, entrypoint **`main.js`**, build command **`npm ci --omit=dev`**, and **180-second** timeout.
3. Preserve the current variables, including `CIRCLE_DATABASE_ID=circle`, the server-only Secret `OPENAI_API_KEY`, and the user's text-model setting. Do not reveal or replace secrets, switch models, add billing, or grant Git access as part of this storage update.
4. Preserve execution permission **users** and the five existing dynamic-key scopes: **`rows.read`, `rows.write`, `files.read`, `files.write`, `tokens.write`**. No new scope, schedule, event, or bucket permission is needed.
5. Inspect existing Storage bucket **`circle-media`** without changing it. The reported configuration is file security **on**, bucket permission **create(users)** only, extensions **`jpg`, `mp4`, `mov`**, and maximum file size **50,000,000 bytes**. Confirm it still has no bucket-wide read/update/delete grant. Do not add WebP, raise the file ceiling, recreate the bucket, move files, or run provisioning. If settings differ, report the difference before making any change.
6. Wait until the new Function deployment is ready and active. Record its deployment ID and exact source commit. Verify logs show a successful build. The Function's read-only storage preflight now targets `circle-media`; it does not verify bucket ACLs, extensions, or remaining capacity.
7. Confirm the existing Vercel project **`dwayne7/circle`**, production hostname **`circle-rho-smoky.vercel.app`**, also serves the matching client update. New JPEG paths require the new client; an older client is intentionally strict about legacy WebP paths. Keep its four public Appwrite variables and hostname registration unchanged. Vercel does not deploy the Appwrite Function.
8. Verify an existing account can still view ordinary photos/videos using an authorized test session. Do not create new accounts or upload personal media solely to verify deployment unless separately authorized. Report deployment/configuration evidence distinctly from actual hosted feature tests.

**Do not run paid text/image generation to verify this deployment.** No paid AI test is authorized by the same-bucket request. OpenAI access diagnosis remains the separate [read-only checklist](OPENAI_DIAGNOSIS.md). If it identifies a required key, permission, model, billing, or verification change, Dot should return that specific action for separate coordination.

## What this update does not prove

Automated tests use simulated Appwrite/OpenAI services and generated fixture bytes. They check bucket routing, file-ID separation, private access, cleanup safety, legacy paths, and preservation of ordinary media. They do not prove that the deployed Function can create a real wallpaper. Record the source version, active server version, website version, unchanged bucket settings, and any untested hosted behavior in the completion handoff.
