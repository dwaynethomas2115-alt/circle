# Wallpaper deployment follow-up

The October 30, 2026 Vercel demo-mode repair is complete, according to Dot's handoff. Keep the existing Vercel project `dwayne7/circle`, production site `https://circle-rho-smoky.vercel.app`, four Production public Appwrite settings, and exact Appwrite Web platform registration. There is no need to import another project or repeat that repair.

The wallpaper error uncovered a separate code defect: Appwrite's SDK documents that asynchronous executions have an empty `responseBody`. The old client tried to parse that empty body after execution completed. A successful background job could therefore produce “Circle’s Appwrite Function did not return a valid response.”

The fix uses three authenticated operations: `prepareTheme` reserves a request without calling OpenAI, `generateTheme` claims and runs that request once in the background, and `themeResult` reads its saved preview or error. Results remain private to the requesting current Circle manager. Job state fits the existing private `ai_quotas` JSON records; no new table or data migration is needed. Previously saved themes remain intact.

## Deploy to the existing Function

The last reported Function deployment was `6ae450ad14d61bb758d9`, using the old `dist/main.js` entrypoint and a 60-second timeout. That is a historical observation from Dot, not a fresh check. Inspect the active deployment before changing settings.

1. Open existing Appwrite project `6ae3ee7000368dcb80e7`, then **Functions → circle-api**. Its API endpoint is `https://fra.cloud.appwrite.io/v1`.
2. Connect or update its Git deployment to repository `dwaynethomas2115-alt/circle`, branch `main`, root directory `appwrite/function`.
3. Use **Node.js 22**, entrypoint **`main.js`**, build command **`npm ci --omit=dev`**, timeout **180 seconds**. Deploy the latest `main` containing this fix and its committed generated `appwrite/function/main.js`; wait until that deployment is ready and active.
4. Preserve `CIRCLE_DATABASE_ID=circle`, the existing server-only OpenAI key, and the user's `OPENAI_THEME_MODEL=gpt-6-luna` setting. This fix does not require changing a model. Keep execute permission limited to signed-in users and dynamic key scopes `rows.read`, `rows.write`, `files.read`, `files.write`, `tokens.write`.
5. Verify Storage bucket `circle-wallpapers` exists with file security enabled, no bucket permissions, allowed extension `webp`, and maximum size **10,485,760 bytes**. Create only this missing bucket if necessary; leave existing media limits, data, and permissions intact.
6. Confirm the existing Vercel production deployment also includes the latest client fix. Vercel publishes the website; it does not deploy the Appwrite Function.

The checked-in Function bundle is self-contained. No ZIP download or secret copied into Vercel is needed. The usual [Git deployment settings](VERCEL_SETUP.md#4-connect-the-existing-appwrite-function-to-github) apply.

## Verify without a paid generation

Check both deployment versions and build logs, the Function entrypoint/timeout, required scopes, variable names, and private bucket configuration. Sign into an existing Circle account and confirm its Circles load. Use Appwrite execution logs to inspect the previously failed wallpaper request, without exposing keys or private request content.

The repository's regression tests use the real client/handler with simulated Appwrite responses that omit asynchronous response bodies and a fake image provider. These checks do not exercise live billing or prove a hosted image can be generated. A live wallpaper generation calls the configured OpenAI text and image models and needs separate user authorization; earlier text-only test approval does not authorize an image test.
