# AI wallpapers with Appwrite

Circle uses your existing Appwrite project. A Circle owner or admin describes everyone's interests in one prompt, and OpenAI generates a colorful illustrated wallpaper combining those subjects. For example: “Anastasia loves pink and Barbie, and Daelin loves tornadoes and volcanoes. Make it bright and playful.” The app previews the image before you apply it.

## Connect the existing Function

1. Open your Appwrite project, then **Functions → circle-api**. Keep its existing database, users, variables and permissions.
2. Connect this Function to the Circle GitHub repository using the [shared GitHub/Vercel workflow](VERCEL_SETUP.md). The deployment directory is `appwrite/function`, the entrypoint is `main.js`, the runtime is Node.js 22, and the build command is `npm ci --omit=dev`. Set the execution timeout to **180 seconds**. The committed `main.js` is already bundled from the source; Appwrite does not need the Expo project to build it.
3. Keep execution restricted to signed-in users. Retain the existing dynamic key scopes: `rows.read`, `rows.write`, `files.read`, `files.write`, and `tokens.write`.
4. Add a private Storage bucket named **`circle-wallpapers`**, with file security enabled, no bucket permissions, a 10 MiB maximum file size, and `webp` as its allowed extension. The server writes this bucket; browser accounts do not get direct read or write permissions. The additive setup script in [the Appwrite guide](../appwrite/README.md) can create this missing bucket without replacing existing data.

The existing 25-table database stays in place. Quota JSON records are read compatibly; no fresh database or data transfer is required. The old Supabase migrations are unrelated to this setup.

## Add OpenAI in Appwrite

1. Create a project API key at [OpenAI Platform](https://platform.openai.com/api-keys). The API project needs billing and access to `gpt-4.1-mini` and `gpt-image-1`; OpenAI may require organization verification for image-model access. API billing is separate from a ChatGPT subscription.
2. In **circle-api → Variables**, save **`OPENAI_API_KEY`** as a secret.
3. Keep `CIRCLE_DATABASE_ID` set to your existing database ID, normally `circle`.
4. Deploy the current Function version after changing its configuration, then wait for its deployment to become ready.

Optional server variables:

| Variable                     | Default        | Purpose                                                  |
| ---------------------------- | -------------- | -------------------------------------------------------- |
| `OPENAI_THEME_MODEL`         | `gpt-4.1-mini` | Matching accessible interface colors.                    |
| `OPENAI_THEME_IMAGE_MODEL`   | `gpt-image-1`  | Images API model supporting WebP output.                 |
| `OPENAI_THEME_IMAGE_QUALITY` | `medium`       | `low`, `medium`, or `high`; affects image cost and time. |
| `THEME_DAILY_LIMIT`          | `50`           | Successful wallpapers per account in a rolling 24 hours. |
| `THEME_BURST_LIMIT`          | `3`            | Generation attempts per account per minute.              |

OpenAI and Appwrite API keys belong in server secrets. Vercel's `EXPO_PUBLIC_APPWRITE_*` settings contain only the public endpoint, project ID and Function ID. Never put the OpenAI key in an `EXPO_PUBLIC_*` variable.

## Generate a wallpaper

1. Sign in to Circle as its owner or an admin.
2. Open the Circle → **Settings → Dream up your Circle**.
3. Describe the colors, characters, places, interests and mood you want together, in up to 1,000 characters.
4. Select **Generate wallpaper**. Image generation can take a minute or more. The app starts one asynchronous Appwrite execution and checks that same execution for its result.
5. Review the image, then select **Apply to Circle**. Generation alone does not replace the saved theme.

Only your typed prompt and fixed visual instructions are sent to OpenAI. Names or other details you type are included; the Function does not fetch or send your posts, chats, photos or profile data. The generated wallpaper is stored privately. Active members receive expiring links to the saved wallpaper; an unapplied preview is available only to its requesting current manager.

Local Demo does not generate images. The website needs the existing public Appwrite settings and a real signed-in account.

## Limits and errors

The Function allows one active generation per account. Failed attempts release their reservation and do not consume the successful-generation daily allowance; the brief attempt limit still applies. Daily allowances roll over as older successful generations reach 24 hours. A daily-limit message gives the reset time instead of asking you to wait one minute. OpenAI can still charge for work performed before a later storage or connection failure; Circle's generation allowance is separate from provider billing.

| What you see                                  | What to check                                                                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| “Maximum 10 per day” and “wait a minute”      | The old Appwrite Function is still running. Deploy the current `main` version of `circle-api`; updating Vercel alone does not change that Function. |
| Local Demo                                    | Set the four public Appwrite settings in Vercel and redeploy the website.                                                                           |
| Function unavailable or invalid response      | Check the Function ID, entrypoint, ready deployment and signed-in execution permission.                                                             |
| OpenAI billing/model access                   | Check API billing, model permissions and any organization-verification requirement.                                                                 |
| Wallpaper storage unavailable                 | Check the private `circle-wallpapers` bucket, storage capacity and Function file/token scopes.                                                      |
| Generation already running                    | Let the current job finish. Retrying in the same client resumes its execution rather than starting another paid request.                            |
| Daily allowance reached                       | Wait for the displayed reset time, or adjust the server limit if you accept the additional API cost.                                                |
| Login works in Codespaces but fails on Vercel | Register the exact Vercel hostname as an Appwrite Web platform. See the [Vercel guide](VERCEL_SETUP.md).                                            |

The repository includes mocked provider and authorization checks. No live OpenAI call, Appwrite deployment or provider billing was exercised without configured account access.
