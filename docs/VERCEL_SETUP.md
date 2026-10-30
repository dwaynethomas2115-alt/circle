# One Circle project, published through Vercel

Use this guide after the Appwrite version from your Codespace has been saved to GitHub and merged into `main`. The repository is [dwaynethomas2115-alt/circle](https://github.com/dwaynethomas2115-alt/circle). That is the shared source for future changes.

| Place     | What it does                                                                  |
| --------- | ----------------------------------------------------------------------------- |
| This chat | Where you request changes to Circle.                                          |
| GitHub    | Keeps the shared code and its history. Codespaces is an editor for that code. |
| Vercel    | Builds the GitHub code and publishes Circle's website.                        |
| Appwrite  | Runs accounts, private data, uploaded media, and Circle's server Function.    |

You can keep using the same GitHub, Vercel, and Appwrite accounts. There is no need to create another Circle repository or another Codespace.

## 1. Connect the repository to Vercel

1. Open [Vercel](https://vercel.com/) and sign in. You can use the account you use for your nursing app.
2. Select **Add New → Project**.
3. Choose **Import Git Repository**, connect your GitHub account if requested, and find **`dwaynethomas2115-alt/circle`**. If the repository is missing, use Vercel's GitHub integration settings to grant it access to that repository.
4. Select **Import**. Name the project **circle**, or another available name you prefer. Keep the root directory as the repository root.
5. Use these build settings. The committed [`vercel.json`](../vercel.json) supplies the commands and output directory:

| Setting           | Value               |
| ----------------- | ------------------- |
| Framework Preset  | **Other**           |
| Install Command   | `npm ci`            |
| Build Command     | `npm run build:web` |
| Output Directory  | `dist`              |
| Node.js Version   | **24.x**            |
| Production Branch | `main`              |

If the import page does not show Node.js Version or Production Branch, check the project's settings after creation. Node.js Version is a Vercel project setting; it is not a field in `vercel.json`.

## 2. Add Circle's public Appwrite settings

On the import screen, expand **Environment Variables**. If the project already exists, open **Settings → Environment Variables** instead. Add these values for **Production**. Add them for **Preview** too if you intend to test preview deployments with this Appwrite project.

| Variable                           | Value                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_BACKEND`              | `appwrite`                                                                                  |
| `EXPO_PUBLIC_APPWRITE_ENDPOINT`    | Your Appwrite project's API endpoint, including `/v1`. Copy it from the project's settings. |
| `EXPO_PUBLIC_APPWRITE_PROJECT_ID`  | Your existing Appwrite project ID.                                                          |
| `EXPO_PUBLIC_APPWRITE_FUNCTION_ID` | Your Circle Function's ID, usually `circle-api` when created with the supplied setup.       |

Use the three public Appwrite values already working in your Codespace's `.env`, and set `EXPO_PUBLIC_BACKEND` to `appwrite`. These are public connection settings, not secret API keys. They must point to the Appwrite project that already contains your Circle data and Function. The repository's [`.env.example`](../.env.example) lists the same names.

Keep **`OPENAI_API_KEY` and Appwrite server API keys in Appwrite Function variables**, not in Vercel's public app settings or `EXPO_PUBLIC_*`. The browser calls the authenticated Circle Function; that Function calls OpenAI.

## 3. Deploy, then allow the website in Appwrite

1. Select **Deploy** in Vercel. Wait for the build to finish.
2. Copy the production website address Vercel gives you, such as `https://circle-example.vercel.app`.
3. Open your existing Appwrite project. In its **Platforms** section, add a **Web** platform for that exact hostname, such as **`circle-example.vercel.app`**. Use the hostname without `https://`, a path, or a trailing slash.
4. Open the Vercel website and sign in with a real Circle account. The header should say **Private space** (local demo is explicitly labeled **LOCAL DEMO**). Confirm that your Circles load, then refresh the browser and check that sign-in still works.
5. Open one Circle's page directly and refresh it. Vercel's fallback serves the app for routes such as `/circle/your-circle-id`; exported assets are served as files.

If you later add a custom domain, register that exact hostname as another Appwrite Web platform. Preview deployments can use different hostnames; register the specific preview hosts you use rather than allowing every Vercel customer's domain.

`EXPO_PUBLIC_WEB_APP_URL` can optionally be set to your production HTTPS address once you know it. It is reserved for native browser links; the current Appwrite integration does not enable live calls.

Changing an Expo public environment variable requires a new web build. If you edited variables after deploying, choose **Redeploy** in Vercel; refreshing the old website alone does not apply them.

## 4. Connect the existing Appwrite Function to GitHub

Connect your existing **`circle-api`** Function to the same repository so server-code updates can deploy automatically too. Keep using its existing project, Function ID, variables, permissions, and database.

1. Open your Appwrite project, then open **Functions → circle-api**.
2. Find its Git/repository deployment settings. Connect your GitHub account if requested, and allow access to **`dwaynethomas2115-alt/circle`**. Labels can vary between Appwrite versions; look for **Git**, **Connect repository**, or **Deploy from Git**.
3. Choose the repository and use these deployment settings:

| Appwrite Function setting | Value                         |
| ------------------------- | ----------------------------- |
| Repository                | `dwaynethomas2115-alt/circle` |
| Branch                    | `main`                        |
| Root Directory            | `appwrite/function`           |
| Runtime                   | **Node.js 22**                |
| Entrypoint                | `main.js`                     |
| Build Command             | `npm ci --omit=dev`           |
| Timeout                   | **180 seconds**               |

4. Enable automatic deployments from this branch if Appwrite presents that option, save, and create the first Git deployment. Wait for its build to finish and become active.
5. Confirm the Function still has its existing `CIRCLE_DATABASE_ID` and any OpenAI variables, authenticated-user execution permission, and the runtime scopes in the [Appwrite setup guide](../appwrite/README.md).
6. Open the Vercel website and check sign-in and a Circle. If OpenAI is configured, test one wallpaper preview.

The committed [`appwrite/function/main.js`](../appwrite/function/main.js) already bundles Circle's TypeScript and shared modules. Appwrite installs only the Function's runtime dependencies and runs that file. This setup uses Git deployments without downloading or uploading a ZIP.

Reference: [Appwrite deployments from Git](https://appwrite.io/docs/products/functions/deploy-from-git).

## 5. Future updates

Once both GitHub connections are configured, the update path is:

**Request a change here → code is tested and pushed to GitHub `main` → Vercel publishes the website and Appwrite deploys Function changes.**

You can use the Vercel website as your usual Circle address. Codespaces remains an optional editor and development preview. Keep any edits made there committed and pushed so this chat, Vercel, and Appwrite can use the same code. Database and bucket settings remain in your existing Appwrite project.

The saved `appwrite-current` branch preserves the earlier Codespace work. If you return to that Codespace after consolidation, first save any new edits, then switch to the shared version:

```sh
git switch main
git pull --ff-only origin main
npm ci
```

The ignored `.env` stays local to that Codespace. Future edits should start from the current `main` version.

For anyone editing server code: run **`npm run build:appwrite`** from the repository root after changing the Function or shared modules it uses, and commit the regenerated **`appwrite/function/main.js`** with those source changes. Appwrite's Git build installs runtime packages; it uses this committed bundle instead of rebuilding shared source outside the Function directory.

## If something does not work

| What you see                                             | What to check                                                                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **LOCAL DEMO**                                           | Add all public Appwrite variables to the deployment's environment, then redeploy.                                                        |
| Invalid platform, origin, or sign-in request             | Add the exact deployed hostname as a Web platform in the same Appwrite project.                                                          |
| Missing Function or invalid Function response            | Check the Function ID and its deployed build in Appwrite. See the Function's logs.                                                       |
| Website works, but an older AI limit or behavior remains | Check that the latest Appwrite Git deployment is active and that the source change includes the regenerated `appwrite/function/main.js`. |
| Refreshing a Circle gives a 404                          | Confirm this repository's `vercel.json` was included in the deployed commit and the output directory is `dist`.                          |
| Build fails                                              | Open the failed deployment's build log. Share the error text; keep secret values out of messages.                                        |

No Vercel or Appwrite Git connection was created, and no live site or Function was deployed, by adding these files. Hosted sign-in, media, wallpaper generation, and both automatic deployments must be verified in the configured accounts.
