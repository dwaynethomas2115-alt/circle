# Connect OpenAI to Circle themes

Circle already has the OpenAI integration code. These steps connect it to **your Supabase project** and **your OpenAI API account**. Adding an API key to the Expo app will not enable it: the key belongs only on the server.

What you will see: a colorful, AI-generated wallpaper that blends the subjects in your description, with matching readable interface colors. For example, “Anastasia likes pink and Barbies, and Daelin likes tornadoes and volcanoes” asks for all of those ideas in one illustrated scene. Preview the wallpaper, then apply it to your Circle. The wallpaper appears across that Circle; your combined Home feed keeps its usual appearance.

## What you need

- Access to the Circle repository and its running app.
- A [Supabase project](https://supabase.com/dashboard), with its database migrations installed.
- An [OpenAI API key](https://platform.openai.com/api-keys) and API billing enabled. API usage is billed separately from a ChatGPT subscription.
- A real signed-in Circle account that owns or administers a Circle.

If the app says **Local demo**, it never calls OpenAI and cannot generate a wallpaper. You need to complete the Supabase setup below to use real AI generation. Your local demo Circles/accounts are separate from real Supabase accounts and will not automatically move across. Appwrite has not been connected in this repository; these instructions apply to the existing Supabase integration.

## 1. Prepare Supabase

Apply only migrations that have not already run in your project. Existing Circle projects need the new wallpaper migration; do not rerun the original schema.

1. Open your Supabase project dashboard.
2. Open **SQL Editor**, then create a new query.
3. In the Circle repository, open [the original migration](../supabase/migrations/202610270001_circle.sql). Copy its complete contents into the SQL editor and run it once.
4. In a second query, do the same with [the community-features migration](../supabase/migrations/202610290001_circle_features.sql).
5. In a third query, apply [the wallpaper migration](../supabase/migrations/202610300001_circle_wallpapers.sql). It creates private wallpaper storage, updates theme validation, and replaces the old quota behavior.

Apply them in this order, on a fresh project intended for Circle. Do not run a migration a second time: these files are one-time migrations, not reset scripts. If you get an error, stop at that error rather than deleting tables or continuing with a half-installed database.

## 2. Add the OpenAI key securely

1. Open [OpenAI API keys](https://platform.openai.com/api-keys) and create a project API key. Ensure that the API project has billing and permission to use `gpt-4.1-mini` and `gpt-image-1`. OpenAI may require organization verification for image-model access.
2. In your **Supabase project dashboard**, open **Edge Functions → Secrets**.
3. Add a secret named **`OPENAI_API_KEY`** and paste the API key into its value field. Save it there.
4. The defaults use `gpt-4.1-mini` for matching colors and `gpt-image-1` for the wallpaper. Image generation is billed by OpenAI. Optional server secrets are listed below; none belongs in the Expo app.

| Server secret                | Default        | Purpose                                                                                  |
| ---------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `OPENAI_THEME_MODEL`         | `gpt-4.1-mini` | Model for accessible interface colors.                                                   |
| `OPENAI_THEME_IMAGE_MODEL`   | `gpt-image-1`  | Image model supporting the Images API and WebP output.                                   |
| `OPENAI_THEME_IMAGE_QUALITY` | `medium`       | Image quality: `low`, `medium`, or `high`. Higher quality can cost more and take longer. |
| `THEME_DAILY_LIMIT`          | `50`           | Maximum successful generations per account in a rolling 24 hours.                        |
| `THEME_BURST_LIMIT`          | `3`            | Maximum generation attempts per account per minute.                                      |

Only one generation can run per account at a time. Failed requests release that reservation and do not use up the daily successful-generation allowance. They still count toward the short burst limit. The daily limit does not reset at midnight; the message tells you when the next slot becomes available. The old “wait a minute” message is no longer used for a daily limit.

If the server loses contact while confirming a completed wallpaper, it checks and retries that confirmation before deciding what happened. An unconfirmed result keeps the private image and explains that it may count toward the daily allowance. Circle’s allowance is separate from billing: OpenAI can still charge for work completed before a later storage or connection failure.

Do not send the key in chat, commit it to GitHub, put it in Expo’s `.env`, or name it `EXPO_PUBLIC_OPENAI_API_KEY`. The Supabase server supplies its own project URL and service-role credentials to the Edge Function; those credentials also stay out of the app.

## 3. Deploy the existing theme function

You can do this entirely in the Supabase dashboard:

1. Open **Edge Functions → Deploy a new function → Via Editor**. If the function already exists, open its code editor instead.
2. Name it exactly **`generate-circle-theme`**.
3. Open [the existing handler](../supabase/functions/generate-circle-theme/index.ts) in the Circle repository. Copy the entire file into the function’s `index.ts` editor, replacing the example template.
4. Deploy the function, including when replacing the earlier palette-only version. Keep the function’s **JWT verification enabled**. The app calls it with a signed-in user’s session; the handler also checks the session, Circle role, and quota itself.

Updating GitHub or redeploying the web app does not deploy this Edge Function or apply SQL migrations. Update the database and function as well as the app to get the new image generation and quota behavior.

The dashboard’s unauthenticated example test is not an end-to-end app test. A real request needs the signed-in user’s bearer token. Use the app in the final step instead of pasting tokens into test examples or chat.

## 4. Point the app at your Supabase project

Skip this section if your app is already using this Supabase project and real sign-in works.

In your Supabase project’s **Connect** dialog or **Settings → API Keys**, find the project URL and the **publishable** key. A legacy **anon** key also works. Do not use a secret or service-role key.

In the Circle repository’s root directory, create an ignored `.env` file with:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
```

Use your actual public values. The environment variable retains its `ANON_KEY` name even if its value is the newer `sb_publishable_...` key. These two values are intended for the client; database RLS enforces access. The OpenAI key does not go in this file.

Stop the running app with **Ctrl+C** and restart after editing `.env`. In a Codespace terminal, from the directory containing `package.json`:

```sh
npm ci
npm run web -- --clear
```

Open the app from the Codespace’s **Ports** tab. Keep the forwarded port private. If you run a deployed web build instead, rebuild and redeploy after setting these two public variables; an existing static build will not read a newly edited `.env` at runtime.

Sign up for a real account, confirm its email if requested, and create a new Circle. The creator is its owner. If you cannot complete email confirmation, check the project’s **Authentication → URL Configuration** and email provider settings; the project’s allowed site/redirect URLs must fit the web app you are using.

## 5. Generate and apply a wallpaper

1. Sign in as the Circle’s owner or admin.
2. Open the Circle → **Settings**, then find **Dream up your Circle**.
3. Describe the colors, people’s interests, characters, places, and mood you want together. For example: **“A colorful pink doll dream world with swirling tornadoes, glowing volcanoes, and sparkles. Fun and adventurous.”**
4. Select **Generate wallpaper**. Image generation can take a minute or more; keep the page open.
5. Review the image, then select **Apply to Circle**.

Generation is a preview: it does not change the saved Circle theme until you apply it. A real generated theme has `source: 'ai'`, a private `wallpaperPath`, and a server-recorded proposal. It cannot be faked by saving arbitrary client JSON. Describe all the subjects you want; the image instructions ask the model to combine them rather than choose just one.

The server sends only your typed visual description and fixed design instructions to OpenAI. It does not fetch or send private posts, photos, chats, member details, or events. Names and other details you type into the prompt are included. Wallpapers are stored in a private bucket and accessed with expiring signed links. Avoid including sensitive personal details in the prompt.

## If it does not work

| What you see                              | What to check                                                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local demo**                            | The running app needs both public Supabase values, then an Expo restart or web rebuild. Demo mode never calls OpenAI.                                                                                      |
| Function unavailable / not found          | The function must be deployed under exactly `generate-circle-theme` in the same project the app uses.                                                                                                      |
| Sign-in expired or a **401** response     | Sign out and back in. Check that the app’s URL/key and function belong to the same project. Keep JWT verification on; a publishable key alone is not a signed-in user session.                             |
| Owners/admins only                        | Create your own Circle or have its owner assign you an admin role. Ordinary members cannot generate or apply themes.                                                                                       |
| Server-side API key missing               | Save `OPENAI_API_KEY` in that project’s **Edge Function Secrets**, not the client `.env`.                                                                                                                  |
| Short wait / generation already running   | Let the current request finish or wait for the stated retry time. Repeated failures do not use up the successful daily allowance.                                                                          |
| Daily allowance reached                   | Wait until the stated reset time, or adjust `THEME_DAILY_LIMIT` in server secrets if you accept the additional API cost.                                                                                   |
| “Maximum 10 per day” with “wait a minute” | That message belongs to an older or different deployment. Apply the wallpaper migration, redeploy this repository’s function, and rebuild the web app.                                                     |
| Image service failed / model access       | Check API billing, image-model permissions, and any OpenAI organization-verification requirement. Check Edge Function logs without copying keys or authorization headers.                                  |
| Wallpaper cannot be saved / displayed     | Check that the wallpaper migration ran, the `circle-wallpapers` bucket is private, and Storage has available capacity. Your account must still be a Circle member; preview access requires manager status. |
| Database function/table missing           | Apply pending migrations in filename order to this same project.                                                                                                                                           |

The source integration and mocked tests are implemented. A live OpenAI request can only be verified after your project, server secret, deployment, and real account are configured.

## Optional: deploy from a terminal instead

The dashboard route above needs no CLI or Docker. If you prefer the CLI, run the commands below from the repository root. The pinned CLI version was checked against npm for this setup guide.

```sh
npx --yes supabase@2.122.0 login
npx --yes supabase@2.122.0 init
npx --yes supabase@2.122.0 link --project-ref YOUR_PROJECT_REF
```

Run `init` only if `supabase/config.toml` does not already exist. Do not overwrite an existing configuration. Complete the CLI’s private authentication prompts in your terminal; do not send tokens or your database password in chat.

If you have **not** applied the migrations through the dashboard, apply them with the CLI:

```sh
npx --yes supabase@2.122.0 db push
```

Choose either dashboard SQL or CLI migrations for the initial install. Do not blindly `db push` files that were already manually run without first reconciling migration history. Then deploy just the theme function:

```sh
npx --yes supabase@2.122.0 functions deploy generate-circle-theme --use-api
```

`--use-api` bundles remotely, avoiding a local Docker requirement. This command keeps JWT verification enabled. Set the OpenAI secret using the dashboard as described above, rather than putting the key in a shell command/history.

Reference: [Supabase function authentication](https://supabase.com/docs/guides/functions/auth), [authorization headers and JWT verification](https://supabase.com/docs/guides/functions/auth-headers), [dashboard deployment](https://supabase.com/docs/guides/functions/quickstart-dashboard), and [OpenAI API keys](https://platform.openai.com/api-keys).
