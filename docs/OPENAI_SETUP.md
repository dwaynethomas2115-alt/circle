# AI wallpapers with Appwrite

Circle uses your existing Appwrite project. A Circle owner or admin describes everyone's interests in one prompt, and OpenAI generates a colorful illustrated wallpaper combining those subjects. For example: “Anastasia loves pink and Barbie, and Daelin loves tornadoes and volcanoes. Make it bright and playful.” The app previews the image before you apply it.

Dwayne approved sharing the existing `circle-media` bucket. New wallpapers use JPEG, which its existing extension list already accepts. The [shared storage deployment handoff](SHARED_WALLPAPER_STORAGE.md) replaces the earlier second-bucket requirement; no bucket, extension, permission, or plan change is needed. The new server and client code still need matching deployments. OpenAI key/model access remains a separate [read-only diagnosis](OPENAI_DIAGNOSIS.md), and no paid generation test is authorized here.

## Connect the existing Function

1. Open your Appwrite project, then **Functions → circle-api**. Keep its existing database, users, variables and permissions.
2. Inspect the active Function deployment. Dot last confirmed deployment `6ae5c5f6876bd6211b25` from `b9ed85b` on October 31, 2026 at 10:43 UTC. That version predates the shared-bucket JPEG update. Its entrypoint is `main.js`, runtime Node.js 22, build command `npm ci --omit=dev`, and timeout **180 seconds**. The committed `main.js` is already bundled from source. Dot's one-time manual archive deployment remains suitable for separately authorized code updates; [Git deployment](VERCEL_SETUP.md) is optional and was not granted in the last handoff.
3. Keep execution restricted to signed-in users. Retain the existing dynamic key scopes: `rows.read`, `rows.write`, `files.read`, `files.write`, and `tokens.write`.
4. Inspect the existing **`circle-media`** bucket. Keep file security on, bucket permission **create(users)** only, extensions **`jpg`, `mp4`, `mov`**, and the existing file-size ceiling. New server-created JPEG wallpapers have empty file permissions, use `wp_` file IDs, and are limited by the app to 10 MiB. Do not create a second bucket, alter permissions/extensions, move files, run provisioning, or upgrade the plan. Legacy WebP paths can still read an existing old wallpaper bucket without creating one.

The existing 25-table database stays in place. Quota JSON records are read compatibly; no fresh database or data transfer is required. The old Supabase migrations are unrelated to this setup.

## Inspect OpenAI in Appwrite

1. Identify the OpenAI API project associated with the existing key, using dashboard metadata or the owner's records. Inspect access to both configured models and their endpoint/request-format compatibility. `gpt-4.1-mini` is only the palette source default; the user's last reported setting is `OPENAI_THEME_MODEL=gpt-6-luna`. Preserve that choice. Its availability and compatibility have not been verified here. `gpt-image-1` is only the image source default when its variable is unset or empty. API billing is separate from a ChatGPT subscription, and image access may be subject to organization verification.
2. In **circle-api → Variables**, confirm **`OPENAI_API_KEY`** is present and marked Secret without revealing or changing its value. Presence does not prove validity or model access.
3. Confirm `CIRCLE_DATABASE_ID` remains your existing database ID, normally `circle`. Read the non-secret model IDs and image-quality value if set; do not change them during diagnosis.
4. Record findings and required setup actions for separate authorization. No new key, permission change, credit purchase, billing-limit change, model fallback, generation test, or Function deployment is part of this read-only inspection.

Optional server variables:

| Variable                     | Default        | Purpose                                                  |
| ---------------------------- | -------------- | -------------------------------------------------------- |
| `OPENAI_THEME_MODEL`         | `gpt-4.1-mini` | Matching accessible interface colors.                    |
| `OPENAI_THEME_IMAGE_MODEL`   | `gpt-image-1`  | Images API model supporting JPEG output.                 |
| `OPENAI_THEME_IMAGE_QUALITY` | `medium`       | `low`, `medium`, or `high`; affects image cost and time. |
| `THEME_DAILY_LIMIT`          | `50`           | Successful wallpapers per account in a rolling 24 hours. |
| `THEME_BURST_LIMIT`          | `3`            | Generation attempts per account per minute.              |

OpenAI and Appwrite API keys belong in server secrets. Vercel's `EXPO_PUBLIC_APPWRITE_*` settings contain only the public endpoint, project ID and Function ID. Never put the OpenAI key in an `EXPO_PUBLIC_*` variable.

## Generate a wallpaper after prerequisites and test authorization

The following is the intended user flow, not a verification step authorized by the current diagnosis. Do not use it until the matching shared-bucket server/client update is active, provider access is checked, and the user has approved a live generation test.

1. Sign in to Circle as its owner or an admin.
2. Open the Circle → **Settings → Dream up your Circle**.
3. Describe the colors, characters, places, interests and mood you want together, in up to 1,000 characters.
4. Select **Generate wallpaper**. Image generation can take a minute or more. The app first reserves a request, starts its background generation, and reads the saved result through authenticated requests. Retrying the same pending prompt checks that request instead of starting another generation.
5. Review the image, then select **Apply to Circle**. Generation alone does not replace the saved theme.

Only your typed prompt and fixed visual instructions are sent to OpenAI. Names or other details you type are included; the Function does not fetch or send your posts, chats, photos or profile data. The generated wallpaper is stored privately. Active members receive expiring links to the saved wallpaper; an unapplied preview is available only to its requesting current manager.

Local Demo does not generate images. The website needs the existing public Appwrite settings and a real signed-in account.

## Limits and errors

The Function allows one active generation per account. Failed attempts release their reservation and do not consume the successful-generation daily allowance; the brief attempt limit still applies. Daily allowances roll over as older successful generations reach 24 hours. A daily-limit message gives the reset time instead of asking you to wait one minute. OpenAI can still charge for work performed before a later storage or connection failure; Circle's generation allowance is separate from provider billing.

| What you see                                        | What to check                                                                                                                                                                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “Maximum 10 per day” and “wait a minute”            | The old Appwrite Function is still running. Deploy the current `main` version of `circle-api`; updating Vercel alone does not change that Function.                                                                                          |
| Local Demo                                          | Set the four public Appwrite settings in Vercel and redeploy the website.                                                                                                                                                                    |
| Function unavailable or invalid response            | Check the Function ID, entrypoint, ready deployment and signed-in execution permission.                                                                                                                                                      |
| Wallpaper reports an invalid response after waiting | Update both the website and Appwrite Function. Appwrite leaves background-execution response bodies empty; the updated client reads the saved wallpaper result separately. See the [deployment follow-up](WALLPAPER_DEPLOYMENT.md).          |
| OpenAI billing/model access                         | Check API billing, model permissions and any organization-verification requirement.                                                                                                                                                          |
| API key or image-model access message               | The old code merged palette/image HTTP 401 and 403 into one message. Use [the diagnosis handoff](OPENAI_DIAGNOSIS.md) to identify the stage and inspect the existing key/project/model metadata. No key replacement or paid test is implied. |
| Wallpaper storage unavailable                       | Check the existing `circle-media` bucket, storage capacity, matching shared-bucket code versions, and Function file/token scopes. No second bucket is needed.                                                                                |
| Generation already running                          | Let the current job finish. Retrying in the same client resumes its execution rather than starting another paid request.                                                                                                                     |
| Daily allowance reached                             | Wait for the displayed reset time, or adjust the server limit if you accept the additional API cost.                                                                                                                                         |
| Login works in Codespaces but fails on Vercel       | Register the exact Vercel hostname as an Appwrite Web platform. See the [Vercel guide](VERCEL_SETUP.md).                                                                                                                                     |

The repository includes mocked provider and authorization checks. No live OpenAI call, Appwrite deployment or provider billing was exercised without configured account access.
