# Circle scrapbook update

Circle's visual direction is a private digital scrapbook with a group chat and threaded conversations: warm paper backgrounds, large uncropped photographs, thin borders, captions under the photos, and dated chapters. The update includes Home Journal/Photos views, cleaner Circle covers and navigation, compact chat headers, grouped messages, and improved reply threads. Month filters and chronological sorting explore the currently loaded memories; they do not claim to load all historical server records.

Photo posts can contain up to ten photographs or one video. The composer supports selecting several photos, adding more, removing and arranging them, choosing the cover, and inspecting each original-quality preview. The feed and detail page show a paged album with swipe/arrow controls, a page count, and a full-screen viewer. Highlights includes every album photo. Photos still accept source inputs up to 200 MB and optimize them into high-quality JPEGs up to 4096px; the existing Appwrite Free storage ceiling remains 50,000,000 bytes per stored file.

## Publish in the existing projects

The website changes publish through the existing GitHub `main` → Vercel `dwayne7/circle` connection. Keep its four Production public Appwrite variables and registered hostname `circle-rho-smoky.vercel.app`. The authenticated header now reads **Private space**; the separate local demo remains explicitly labeled **LOCAL DEMO**.

Multiple-photo posting needs the latest **`circle-api`** Function, too. The last deployment confirmed by Dot was **`6ae4c4c3e1e38ec870b5`**, from **`30c28ff03e6373086af67fb2bd8742a47d423a47`**. That version contains the wallpaper response fix and supports existing single-media posts; it predates albums. Before uploading an album, the new client checks `mediaCapabilities`. An older Function returns a clear server-update message and preserves the draft without uploading its files.

Deploy the current committed `appwrite/function/main.js`, `package.json`, and `package-lock.json` to the **existing** Appwrite project **`6ae3ee7000368dcb80e7`**, Function **`circle-api`**. Dot's previous manual archive method remains suitable. Use the saved **Node.js 22**, entrypoint **`main.js`**, build command **`npm ci --omit=dev`**, timeout **180 seconds**. Retain the current database, variables, authenticated-user execution permission, and existing dynamic key scopes. This change needs no new table, column, bucket, credential, or permission. Git integration is optional and was not granted in the previous deployment.

Albums use the existing **`circle-media`** bucket. The Function validates every attachment's ownership, completed upload, format, and readiness. It signs only media in authorized snapshots and records all album references so cleanup cannot delete a non-cover photo. Every upload finishes before the single post is committed. If a later upload or publication fails, the draft remains and no partial post is published; already sealed unreferenced files remain private until the existing administrator cleanup runs.

## Existing wallpaper blocker

Dot reported that the Free project permits only one bucket, already used by `circle-media`; `circle-wallpapers` could not be created. This design/album update does not change wallpaper storage, permissions, or plans and does not resolve that separate blocker. See the [wallpaper status](WALLPAPER_DEPLOYMENT.md). No live AI generation is needed to deploy or verify photo albums.

## Verification

Automated checks exercise real album selection, arranging/removing/appending photos, ten-photo limits, preserved dimensions and order after reload, full-screen navigation, mobile layouts, and month filtering. Backend tests cover all-file authorization, atomic publication, reference cleanup, and old-server preflight. These use local demo data and simulated Appwrite services; authenticated hosted album posting still needs verification after the Function deployment.
