# Journal wallpaper placement and simple pattern update

Prepared November 1, 2026 in response to Dwayne's request. Dwayne approved publishing the website update and giving Dot the updated wallpaper instructions for deployment. Codex publishes to the existing GitHub repository; Dot handles the matching Appwrite deployment separately. The earlier Sunburst deployment does not contain this new layout and prompt revision. No paid generation test is authorized.

## Result

- Wallpaper is inside the rounded central Circle frame containing “Circle journal,” around the post cards and other information. The far outer page stays a plain theme color.
- The extra wallpaper hero and opaque cover over the journal frame are removed. Post cards, journal headings, month labels, and controls keep readable solid surfaces.
- Wallpaper repeats at its natural fitted scale along long journals instead of enlarging one image across the full feed. The settings preview uses the same repeating behavior.
- Future generation requests ask for one uniform solid background with small recognizable illustrations of every requested subject, loose spacing, generous empty space, and clear edges for repetition. For example: a pink background with small Barbie dolls and tornadoes.
- Settings guidance and the example prompt describe this simpler style.

Existing wallpaper files are not redrawn, overwritten, or regenerated. Their placement changes with the website update. The simpler art instructions apply to new requests only after the updated Appwrite Function is deployed. No generation is required or authorized to publish or verify deployment.

## Preserved behavior

Keep `OPENAI_THEME_IMAGE_MODEL=gpt-image-2.5-sunburst` and `OPENAI_THEME_MODEL=gpt-6-luna`. The image request remains JPEG, `1536x1024`, medium quality, compression 85, and opaque background. There is no fallback model or automatic provider retry.

The existing private `circle-media` storage path, membership checks, short-lived signed URLs, authentication, database, credentials, permissions, billing, and plans are unchanged. The UI reuses the existing shared wallpaper resolver; moving the image does not grant access to another Circle's wallpaper.

## Verification

- The implementation is commit `209600490fc857b1eca958213ecb7306b40d40cb`; this approval follow-up changes documentation only. A fresh no-write build at publication review exactly matched the committed backend bundle.
- 80 backend tests and 87 client tests passed, with provider work mocked.
- Type checking and lint passed; the Appwrite bundle was rebuilt.
- A web export with dummy Appwrite public settings passed desktop and phone browser checks using an intercepted fake account, sample posts, and a mock patterned image. All external requests were intercepted or blocked; there was no live account, upload, provider request, or paid generation.
- Browser checks verified repeating artwork inside the journal frame, opaque post cards, no horizontal overflow, working Chat/settings navigation, and wallpaper removal when navigating to an unthemed Circle. Browser checks do not establish native-device behavior or real hosted image generation.

## Approved release handoff

1. Use the exact remote commit verified in Codex's publication message. It includes the reviewed implementation and this approval update. Publication uses a normal fast-forward push after checking for remote changes. The established GitHub integration may update Vercel automatically; verify its actual status separately rather than claiming a Ready website from Git publication alone.
2. Dot should deploy the matching backend code to existing Appwrite project `6ae3ee7000368dcb80e7`, Function `circle-api`. Package only the following three committed files at the archive root:

| Archive file        | Repository path                       | Git blob SHA                               |
| ------------------- | ------------------------------------- | ------------------------------------------ |
| `main.js`           | `appwrite/function/main.js`           | `97393f2bc58133bdd9f65bc7e6b9e5d44d30776a` |
| `package.json`      | `appwrite/function/package.json`      | `179070395e599eeae177b52c4dddf5746d7b5b27` |
| `package-lock.json` | `appwrite/function/package-lock.json` | `54785bc26284ff14eb3b23b2161b5ae74fbe3c93` |

3. Preserve Node.js 22, entrypoint `main.js`, build command `npm ci --omit=dev`, timeout 180 seconds, existing execution permission/scopes, and all saved variables. No model or dashboard setting change is needed for this revision.
4. Verify an active deployment and record its exact source. Do not generate or retry a wallpaper as a deployment test. A live generation would need separate authorization and can incur usage charges.

Publishing the website alone changes placement and settings text; it does not update the manually deployed server's image instructions. Appwrite deployment alone changes future image instructions; it does not update the website layout. Both source updates are required for the full requested behavior.
