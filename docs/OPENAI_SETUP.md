# Connect OpenAI to Circle themes

Circle already has the OpenAI integration code. These steps connect it to **your Supabase project** and **your OpenAI API account**. Adding an API key to the Expo app will not enable it: the key belongs only on the server.

What you will see: an AI-suggested color palette and a subtle decorative motif, such as garden, unicorn, Vegas, coast, or minimal. You can preview the result and then apply it to one Circle. This does **not** generate wallpaper images, photorealistic rooms, or a 3D room.

## What you need

- Access to the Circle repository and its running app.
- A [Supabase project](https://supabase.com/dashboard), with its database migrations installed.
- An [OpenAI API key](https://platform.openai.com/api-keys) and API billing enabled. API usage is billed separately from a ChatGPT subscription.
- A real signed-in Circle account that owns or administers a Circle.

If the app says **Local demo**, it uses local presets and never calls OpenAI. You need to complete the Supabase setup below to use real AI generation. Your local demo Circles/accounts are separate from real Supabase accounts and will not automatically move across.

## 1. Prepare Supabase

Skip the migration part if both Circle migrations have already been applied to this project. If you already applied only the original migration, skip step 3 and apply only the pending community-features migration in step 4.

1. Open your Supabase project dashboard.
2. Open **SQL Editor**, then create a new query.
3. In the Circle repository, open [the original migration](../supabase/migrations/202610270001_circle.sql). Copy its complete contents into the SQL editor and run it once.
4. In a second query, do the same with [the community-features migration](../supabase/migrations/202610290001_circle_features.sql).

Apply them in this order, on a fresh project intended for Circle. Do not run a migration a second time: these files are one-time migrations, not reset scripts. If you get an error, stop at that error rather than deleting tables or continuing with a half-installed database.

## 2. Add the OpenAI key securely

1. Open [OpenAI API keys](https://platform.openai.com/api-keys) and create a project API key. Ensure that the API project has billing and permission to use `gpt-4.1-mini`.
2. In your **Supabase project dashboard**, open **Edge Functions → Secrets**.
3. Add a secret named **`OPENAI_API_KEY`** and paste the API key into its value field. Save it there.
4. Leave the model setting alone to use `gpt-4.1-mini`. An optional `OPENAI_THEME_MODEL` secret can select another model that supports Chat Completions structured JSON output.

Do not send the key in chat, commit it to GitHub, put it in Expo’s `.env`, or name it `EXPO_PUBLIC_OPENAI_API_KEY`. The Supabase server supplies its own project URL and service-role credentials to the Edge Function; those credentials also stay out of the app.

## 3. Deploy the existing theme function

You can do this entirely in the Supabase dashboard:

1. Open **Edge Functions → Deploy a new function → Via Editor**. If the function already exists, open its code editor instead.
2. Name it exactly **`generate-circle-theme`**.
3. Open [the existing handler](../supabase/functions/generate-circle-theme/index.ts) in the Circle repository. Copy the entire file into the function’s `index.ts` editor, replacing the example template.
4. Deploy the function. Keep the function’s **JWT verification enabled**. The app calls it with a signed-in user’s session; the handler also checks the session, Circle role, and quota itself.

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

## 5. Generate and apply a decoration

1. Sign in as the Circle’s owner or admin.
2. Open the Circle → **Settings**, then find **Make it feel like your Circle**.
3. Enter a description such as **“A quiet garden with sage green accents”**.
4. Select **Preview from description**.
5. Review the palette and motif, then select **Apply to this Circle**.

Generation is a preview: it does not change the saved Circle theme until you apply it. A real generated theme has `source: 'ai'` and a server-recorded proposal. The local demo matches a curated preset instead and says so.

The server sends only your typed visual description and fixed design instructions to OpenAI. It does not fetch or send private posts, photos, chats, member details, or events. Avoid including personal details in a decoration prompt.

## If it does not work

| What you see                               | What to check                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Local demo** or a curated preset preview | The running app needs both public Supabase values, then an Expo restart or web rebuild. Demo mode never calls OpenAI.                                                          |
| Function unavailable / not found           | The function must be deployed under exactly `generate-circle-theme` in the same project the app uses.                                                                          |
| Sign-in expired or a **401** response      | Sign out and back in. Check that the app’s URL/key and function belong to the same project. Keep JWT verification on; a publishable key alone is not a signed-in user session. |
| Owners/admins only                         | Create your own Circle or have its owner assign you an admin role. Ordinary members cannot generate or apply themes.                                                           |
| Server-side API key missing                | Save `OPENAI_API_KEY` in that project’s **Edge Function Secrets**, not the client `.env`.                                                                                      |
| Limit reached                              | Wait for the rolling quota window. Limits are 5 per user/Circle/hour, 20 per user/day, and 12 per Circle/hour. Failed provider attempts also count.                            |
| Theme service failed                       | Check the project API key, API billing, model access, and Supabase Edge Function logs. Do not paste keys or authorization headers into chat or logs.                           |
| Readability requirements failed            | Try another short description or select a preset. The current theme stays unchanged.                                                                                           |
| Database function/table missing            | Apply the original migration and then the feature migration to this same project.                                                                                              |

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
