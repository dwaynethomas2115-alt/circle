# Calendar AI rebuild and deployment handoff

This implementation was rebuilt from the agreed requirements on `bbddc692ab2619a1d2ada0a4a569d9bc8d2c9216`. The prior local commit `7de5ca6a8a756e663b3c897974dc65b7acd9cc05` could not be recovered. Its reported test counts are not evidence for this rebuild.

## Behavior

The existing Circle calendar now offers an AI planning panel. A member can describe plans, attach one supported file, and clarify by updating the description and analyzing again. The device IANA timezone is displayed. The model returns editable proposals and clarification warnings; it does not write events. Missing or ambiguous times must be supplied explicitly. Each selected event requires a review acknowledgment, followed by a separate final batch confirmation. Editing a proposal invalidates its review and final confirmation. Editing the source clears previous proposals. Manual events, RSVP, and the rest of Circle remain available.

Supported input: up to 4,000 typed characters, one UTF-8 TXT/CSV file up to 12,000 bytes, or JPEG/PNG/WebP up to 10 MiB and 20 MP. The client converts images to JPEG at most 1024 pixels on either side and 192 KiB; unusually detailed images that cannot meet that bound are rejected with a crop instruction. The server decodes the JPEG with sharp and checks dimensions and size again. Images are sent inline, never placed in the Circle media bucket. Native temporary picker/conversion files are removed after reading.

At most 20 future timed events can be proposed/saved. Titles are 3–120 characters, descriptions at most 500, locations at most 200. The calendar uses explicit ISO timestamps with timezone offsets, shown in device-local time for review. No PDF, Office, ICS, HEIC, recurring or all-day imports. No cross-device draft UI or multi-attachment analysis. There is no arbitrary daily spending cap or AI-off flag in this integration.

## Provider and privacy

The calendar server always sends `model: "gpt-6-luna"` to `https://api.openai.com/v1/responses`, with structured JSON output, low reasoning, an 8,000 output-token bound, a 90-second timeout, no tools, and `store: false`. There is no alternate-model fallback. OpenAI's official model page documents text/image input and structured outputs: https://developers.openai.com/api/docs/models/gpt-6-luna . Public availability does not verify access for Circle's existing API project.

The existing secret `OPENAI_API_KEY` is used only by the Function. Calendar does not depend on `OPENAI_THEME_MODEL`; wallpaper configuration is unchanged. No new key, account, billing change, or permission expansion is needed by the code.

User source text and image bytes are not written to application database rows or logs. Provider/platform request handling still follows their own policies; `store: false` is not a promise of zero provider retention. Private `calendar_imports` records hold a source hash, owner/Circle identifiers, timestamps, bounded extracted results, and save receipts. Results are retrievable for 24 hours by their exact request ID and current member; the UI retains IDs only in memory. Saved receipts remove proposals and retain event IDs/hash to make retries safe. Expired unsaved result records remain in private storage until maintenance; expiration denies their retrieval but is not automatic physical deletion.

## Authorization, retries, and bounds

The server rechecks current membership for analysis, result reads, completion and save. Actor identity comes from Appwrite, never the client. A client-generated UUID plus actor scopes the durable analysis claim; the source hash prevents changing an existing request. Concurrent claims use existing user/Circle transaction guards. Retrying an unchanged request never starts a second provider call. A failed or crashed job requires explicitly selecting a new analysis request before another paid attempt. If the worker loses its result before recording completion, the existing claim remains terminal/pending rather than silently generating again.

Saving requires reviewed flags for every selected event plus the batch confirmation. The server validates dates and all fields again, stores the save payload hash, and returns the same receipt for exact retries. Changed retries are rejected. Matching normalized title, start, end and location in the same Circle are skipped, including manually created events. The existing transaction commits at most 20 event rows and one receipt together; no partial batch is intentionally committed. Tests use the repository's deterministic fake database and do not prove hosted transaction behavior.

Ordinary request limits remain 24,000 bytes. Analysis is bounded to 290,000 bytes, batch save to 30,000 bytes, provider responses to 256,000 bytes, and extracted results to 24,000 bytes. The 32,768-byte row and 100-operation transaction ceilings remain enforced. Large Unicode descriptions or excessive warnings may require a smaller batch/source.

## Deployment order and existing targets

Existing production target documented by the project: `https://circle-rho-smoky.vercel.app`, Vercel project `dwayne7/circle`. Existing Appwrite: `https://fra.cloud.appwrite.io/v1`, project `6ae3ee7000368dcb80e7`, database `circle`, Function `circle-api`. These identifiers are historical repository configuration, not a fresh inspection of production.

1. With the existing Appwrite administrator connection, run `npx tsx appwrite/provision-calendar.ts` to inspect. Run it with `--apply` to create only the private `calendar_imports` table/standard columns in the existing database. Re-run without `--apply` until all columns are available. No bucket, existing table, permission, or credential is altered. Avoid the general provisioning script: this update only needs the new table.
2. Build and test the exact commit. The committed server bundle must be regenerated with `npm run build:appwrite`.
3. Deploy `appwrite/function/main.js`, `package.json`, and `package-lock.json` from that commit using the existing one-time archive method. Preserve Node.js 22, entrypoint `main.js`, `npm ci --omit=dev`, 180-second timeout, user execution permission, existing dynamic scopes and variables. The runtime dependencies now include sharp for bounded image validation. The repository documents manual Function deployment; do not assume GitHub updates it.
4. Verify active Function source/build and authenticated `calendarCapabilities` returns `gpt-6-luna`. This endpoint checks existing key presence, not provider acceptance. With existing authorized access, inspect the API project's model availability and perform a synthetic text/image extraction without saving calendar events.
5. Publish the client to GitHub `main` through the existing Vercel integration only after the backend/schema is ready. Verify the Vercel deployment's exact source commit and both hosted health and review/confirm flow.

This executor currently has no configured Appwrite/OpenAI/Vercel secrets, identities, or connectors, and its destination policy does not include those production hosts. It cannot apply the migration, deploy the Function, inspect live variables, or verify real extraction. Publishing a feature branch is safe; merging to production before the required backend migration is verified is deferred. The smallest next access step is an already-authorized session for the existing Appwrite project to apply this migration/deployment and inspect the existing key/model access. Do not create a replacement key or broaden persistent access without action-time confirmation.

## Validation

Fresh verification and exact counts are reported in the completion handoff. Commands: `npm test`, `npm run test:appwrite`, `npm run typecheck`, `npm run lint`, `npm run build:appwrite`, and Expo exports for web/iOS/Android. The new tests exercise authorization, claim reuse, malformed/oversized inputs, provider failure/refusal, explicit review/confirm, atomic rollback, duplicate imports, concurrent saves, and the row/transaction bounds.

`e2e/calendar-ai/smoke.cjs` tests the real exported client with synthetic Appwrite/provider responses only. See its README for commands. No live extraction, production migration, physical-device picker, camera behavior, or hosted deployment is established by these tests.

Fresh local verification on November 3, 2026: 165 app tests and 100 Appwrite tests passed (265 total); 10 new mocked browser cases passed. Type checking, ESLint, diff whitespace validation, server bundling, and web/iOS/Android exports passed. A clean `npm ci --omit=dev` of the three deployment files succeeded; importing the resulting bundle and issuing an unauthenticated request returned 401. Native exports verify bundling, not device picker execution. Browser reports and command logs are retained under `/tmp/circle-calendar-browser` and `/tmp/circle-*-results.txt` in this executor.
