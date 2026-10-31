# Wallpaper deployment follow-up

The existing production website is `https://circle-rho-smoky.vercel.app`, Vercel project `dwayne7/circle`. Keep its public Appwrite connection variables, hostname registration, repository, and existing accounts.

Dwayne has approved sharing the existing **`circle-media`** bucket for wallpapers. The [current shared-bucket JPEG deployment handoff](SHARED_WALLPAPER_STORAGE.md) replaces the earlier second-bucket setup. JPEG is already accepted by the media bucket, so this update needs **no bucket, extension, permission, file-limit, or plan change**.

## Latest reported deployment

Dot's October 31, 2026 10:43 UTC handoff confirmed active Appwrite deployment **`6ae5c5f6876bd6211b25`**, from commit **`b9ed85b7d8ed3982d9c3230d033275f49e1796d6`**, replacing `6ae59cd6da3487b42096`. Build/deployment logs finished successfully. Settings remained Node.js 22, entrypoint `main.js`, build command `npm ci --omit=dev`, and timeout 180 seconds. This was a manual archive deployment, with no Git integration, new credentials, permission changes, or paid generation.

That deployment contains stage-aware provider errors and a pre-OpenAI storage check. It still expects the absent `circle-wallpapers` bucket. The shared-bucket source update must be deployed before the Function uses `circle-media`. No hosted generation, successful OpenAI access, or matching deployment of the new storage code has been verified by this workspace.

## Current storage contract

New JPEG theme paths are `<CircleID>/<request UUID>.jpg`; they resolve to `circle-media` file ID `wp_<UUID without hyphens>`. The Function creates wallpaper files with empty file permissions, and checks current Circle membership or the requesting manager's own preview before issuing a 60-second token. The wallpaper image limit is 10,485,760 bytes while the existing bucket ceiling stays unchanged. Photos, videos, accounts, and database rows remain in place and use their existing rules.

Legacy `.webp` paths continue to resolve to the old `circle-wallpapers` bucket if one already exists. Do not create, migrate, delete, or change that legacy bucket as part of the shared-bucket update. Normal provisioning now requires only `circle-media`.

## Existing Function settings to preserve

| Setting            | Existing value                                               |
| ------------------ | ------------------------------------------------------------ |
| Project            | `6ae3ee7000368dcb80e7`                                       |
| API endpoint       | `https://fra.cloud.appwrite.io/v1`                           |
| Function           | `circle-api`                                                 |
| Runtime            | Node.js 22                                                   |
| Entrypoint         | `main.js`                                                    |
| Build command      | `npm ci --omit=dev`                                          |
| Timeout            | 180 seconds                                                  |
| Execute permission | users                                                        |
| Dynamic key scopes | rows.read, rows.write, files.read, files.write, tokens.write |

Dot can use the existing one-time manual archive method with the approved commit's `appwrite/function/main.js`, `package.json`, and `package-lock.json`. The committed entrypoint is bundled; no repository-wide build is needed in Appwrite. The matching Vercel client must also publish so it accepts new `.jpg` paths and validates the shared bucket/file-ID mapping. Detailed steps and safe verification boundaries are in [the current handoff](SHARED_WALLPAPER_STORAGE.md).

Keep the existing Secret `OPENAI_API_KEY`, `CIRCLE_DATABASE_ID=circle`, and `OPENAI_THEME_MODEL=gpt-6-luna`. The key's presence and the text-model setting were reported by Dot; neither key validity nor model compatibility has been established. No image-model or quality override was listed in Function-specific variables. Source defaults are not proof of live access.

## Verify without paid generation

Inspect active source versions, ready deployment/build logs, preserved settings, and the existing shared-bucket configuration. The storage preflight uses existing `files.read` access and stops before OpenAI if the required bucket cannot be read; it does not verify ACLs, extensions, or available quota. Use an authorized existing-account session to inspect ordinary media when available. Do not create new accounts, upload personal media, or run a wallpaper generation solely to obtain verification without separate authorization.

OpenAI diagnosis remains the [read-only checklist](OPENAI_DIAGNOSIS.md). No generation, model fallback, secret reveal, key replacement, permission change, or billing action is authorized by this document. Automated tests with fake provider/storage services establish code behavior, not successful hosted image generation.

## Historical fixes retained

The old client attempted to parse Appwrite's empty asynchronous execution response body. The current protocol instead reserves a request synchronously, runs one claimed background worker, and reads its saved result/error through authenticated requests. Retries reuse the reservation; the server avoids duplicate paid work.

The old provider message also combined palette/image HTTP 401 and 403 and blamed every HTTP 400 on the prompt. Stage-aware errors and safe diagnostics now distinguish authentication, access, model, request settings, billing, rate limits, and explicit content-policy rejection. These improvements do not grant OpenAI access or establish that a configured model is available.
