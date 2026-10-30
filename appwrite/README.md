# Circle Appwrite integration — normalized schema

Circle now uses Appwrite Auth, TablesDB, Storage and Functions. Local demo remains separate and unchanged. This coding task did not create credentials, deploy, push, delete cloud resources or transfer live data. The user confirmed prior usage was demo-only. Historical Supabase code remains preserved.

**The earlier single-row pilot is superseded. Do not deploy its archive or initialize `circle_state/main`.** The existing empty `circle_state` table may remain untouched; the new Function never accesses it. There is no global metadata payload or 900 KB aggregate ceiling.

## Exact setup contract

Use free TablesDB database **`circle`**, authenticated Function **`circle-api`**, and Storage bucket **`circle-media`**, plus the server-only **`circle-wallpapers`** bucket for generated themes. No initial rows are required. The Function creates profiles, claims and guards transactionally when needed.

The authoritative machine-readable contract is [`schema.json`](schema.json), generated from [`function/tables.ts`](function/tables.ts). Create these 25 tables:

`profiles`, `circles`, `members`, `join_requests`, `invitations`, `posts`, `reactions`, `comments`, `messages`, `notifications`, `blocks`, `reports`, `polls`, `poll_options`, `votes`, `events`, `rsvps`, `themes`, `read_states`, `uploads`, `ai_quotas`, `ai_proposals`, `guards`, `usernames`, `media_refs`.

Every table has **row security enabled**, **empty table permissions**, and the following **required string columns**:

| Column       | Maximum characters | Purpose                                                       |
| ------------ | -----------------: | ------------------------------------------------------------- |
| `entity_id`  |                128 | Original domain ID or composite identity                      |
| `scope_id`   |                128 | Circle/parent scope, depending on entity                      |
| `actor_id`   |                128 | User/author/recipient identity                                |
| `related_id` |                128 | Parent, discovery/status flag, invite hash or file reference  |
| `sort_at`    |                 32 | ISO timestamp for ordered queries; empty where not applicable |
| `data`       |             32,768 | One entity's JSON fields, validated by server commands        |

These are per-entity records with indexed routing keys, not a document containing a whole Circle or application. Reactions, poll options, votes, memberships and RSVPs each have independent rows. No growing reaction/member/vote array is stored inside its parent. `data` is an extensible JSON encoding of the remaining entity fields; it is not queryable as typed individual columns. Row IDs are deterministic SHA-256-derived 32-character IDs; identity/relationship integrity is enforced server-side. All created rows explicitly have empty permissions.

Indexes are ordinary `key` indexes, with the order shown:

| Tables                                                      | Indexes                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| profiles                                                    | entity_id ASC; related_id ASC                                                           |
| circles                                                     | entity_id ASC; related_id ASC + sort_at DESC                                            |
| members                                                     | scope_id ASC; actor_id ASC                                                              |
| join_requests                                               | scope_id ASC + sort_at DESC; actor_id ASC + sort_at DESC                                |
| invitations                                                 | scope_id ASC; related_id ASC                                                            |
| posts, messages, reports, polls, events                     | scope_id ASC + sort_at DESC                                                             |
| reactions, comments, poll_options, votes, rsvps, media_refs | related_id ASC                                                                          |
| notifications                                               | scope_id ASC; actor_id ASC + sort_at DESC; actor_id ASC + related_id ASC + sort_at DESC |
| blocks                                                      | actor_id ASC; related_id ASC                                                            |
| themes                                                      | scope_id ASC                                                                            |
| read_states                                                 | actor_id ASC                                                                            |
| uploads                                                     | actor_id ASC + related_id ASC + sort_at DESC; sort_at DESC                              |
| ai_quotas, ai_proposals, guards, usernames                  | No additional indexes; deterministic row-ID lookup                                      |

Index keys, columns and ordering are provided exactly in `schema.json`. Wait until columns AND indexes are `available` before using the Function. Extra indexes on existing tables are harmless; the supplied setup script does not remove anything.

Storage bucket **`circle-media`**: file security enabled; bucket permission **create(users)** only; no bucket read/update/delete permissions; requested maximum file size **262,144,000 bytes**; extensions `jpg`, `mp4`, `mov`. Your Appwrite plan can enforce a lower maximum. The setup script preserves an existing lower limit unless `--update-media-limit` is explicitly supplied; if a fresh bucket's requested ceiling is rejected specifically for file size, it falls back to 50,000,000 bytes with a clear message. Enable encryption and antivirus where the plan/file size supports them; Appwrite may skip those bucket features for files above 20 MB. The client uploads with its own read/delete file permissions; the server verifies and removes those grants before publication. Sealed files have empty permissions.

Function **`circle-api`**: **Node.js 22**, Git repository root **`appwrite/function`**, entrypoint **`main.js`**, install command **`npm ci --omit=dev`**, timeout **180 seconds**, execute permission **users** only. No public/custom-domain invocation, guest/any execution, schedules or events are needed. Dynamic key scopes: **`rows.read`, `rows.write`, `files.read`, `files.write`, `tokens.write`**. Use a dedicated Circle project because these runtime key scopes apply project-wide.

Wallpaper bucket **`circle-wallpapers`**: file security enabled, **empty bucket permissions**, maximum file size **10,485,760 bytes**, extension `webp`. Only the Function uploads files, always with empty file permissions. Browser/native clients cannot upload directly or read these files without a short-lived server-issued token. Existing table data and the media bucket remain separate.

Required Function variable: `CIRCLE_DATABASE_ID=circle`. Appwrite supplies `APPWRITE_FUNCTION_API_ENDPOINT`, `APPWRITE_FUNCTION_PROJECT_ID`, `x-appwrite-key`, and `x-appwrite-user-jwt`. Optional variables: `CIRCLE_PUBLIC_ENDPOINT` for public/custom media URLs; secret `OPENAI_API_KEY`; `OPENAI_THEME_MODEL` (default `gpt-4.1-mini`), `OPENAI_THEME_IMAGE_MODEL` (default `gpt-image-1`), `OPENAI_THEME_IMAGE_QUALITY` (`low`, `medium`, or `high`, default `medium`), `THEME_DAILY_LIMIT` (1–200, default 50), and `THEME_BURST_LIMIT` (1–10, default 3). No API key belongs in the client. The handler verifies `Account.get()` using the caller JWT before touching privileged services.

Enable email/password Auth. Register Web platforms for exact localhost/preview/production hostnames, and Apple/Android platforms for `app.circle.private`. Native uses the official native SDK and a development/release build; device session persistence still needs testing. Web uses the web SDK; a first-party/custom API domain may be needed for browser cookie restrictions.

## Setup and build tools

`provision.ts` creates missing normalized resources and verifies existing column/index/permission compatibility. Its normal `--create-missing` mode preserves existing resources; it does not delete data or read/write `circle_state`. The optional `--update-media-limit` additionally requests a larger ceiling on the existing media bucket without changing its permissions; the provider's plan still applies. The script does not create a project, credentials or a Function. Run it in a private administrator terminal with `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `CIRCLE_DATABASE_ID` set. The temporary setup key needs the corresponding database/table/column/index read/create and bucket read/create scopes, plus bucket update scope if requesting a limit change; it is separate from runtime Function scopes. Revoke it after setup. Do not paste keys into chat or source control.

```sh
npx tsx appwrite/provision.ts --create-missing
npm ci
npm run build:appwrite
```

Connect the Appwrite Function to this GitHub repository and the `main` branch, with Git root `appwrite/function` and entrypoint `main.js`. The root build command bundles shared TypeScript into this committed, self-contained entrypoint; runtime packages are installed from the Function’s `package-lock.json`. Later pushes to `main` can automatically redeploy the connected Function, while Vercel deploys the web client from the same repository. Do not deploy unbundled TypeScript or the obsolete archive. Connecting the Function to Git initially must be completed in the owner’s Appwrite/GitHub accounts; Vercel does not deploy Appwrite Functions.

Client public configuration (restart/rebuild Expo after changes):

```dotenv
EXPO_PUBLIC_BACKEND=appwrite
EXPO_PUBLIC_APPWRITE_ENDPOINT=https://YOUR_REGION.cloud.appwrite.io/v1
EXPO_PUBLIC_APPWRITE_PROJECT_ID=YOUR_PROJECT_ID
EXPO_PUBLIC_APPWRITE_FUNCTION_ID=circle-api
```

Leave all Appwrite values empty for local demo. Partial configuration fails visibly; it never falls back to sample data. Existing Supabase environment values are ignored.

## Authorization and transactions

The Function accepts a strict allowlist of domain commands and derives the actor from verified Auth. Table/row ACLs deny direct client access. Membership, ownership, roles, cross-circle references, blocks, invitation hashes and media ownership are checked server-side. Snapshots hide private outsider/revoked content, other users' emails and invitation tokens. Invitations use 192-bit random tokens and hashes at rest; redemption is atomic.

Each mutation resolves the target entity's scope, starts an Appwrite transaction, then stages a write to the actor guard and applicable Circle/upload guards **before loading authorization and entity data inside the transaction**. Preliminary lookups route requests only; they do not authorize them. The domain transition runs against a targeted slice. Persistence computes the difference and creates/updates/deletes only changed rows. New Circles create their guard, metadata and owner membership in the same commit. Unique username claim rows arbitrate concurrent claims across different users.

Success is returned only when Appwrite reports `committed`. Conflicts return HTTP 409 and trigger rollback; commands are not automatically replayed. Different users writing to different Circles do not share a global guard. Writes within one Circle serialize/conflict at its guard, and one user's concurrent commands share that user's guard. This favors correctness over maximum same-Circle throughput; there is no benchmarked throughput/user-count guarantee.

Official Appwrite docs specify staged operations, reads of transaction-local changes and conflict detection when affected rows change externally. They do not establish that an arbitrary series of independent reads is an atomic snapshot. Consequently, read-only hydration records guard revisions before loading and compares them afterward; a membership/content change fails closed instead of returning a mixed private snapshot. Profile bootstrap uses the mutation path. A request overlapping a later revocation may already have returned content; previously viewed content cannot be recalled.

The free plan currently permits **100 staged operations per transaction**. The adapter counts guards plus entity changes and rejects over-budget commands before committing. Large notification fan-out, a post with many dependent deletions, or extensive membership cleanup can exceed this budget. No partial content or silent notification truncation is committed. Before such large-group operations, implement an explicit outbox/batched workflow or configure/test a larger transaction budget; upgrading a plan alone does not change the adapter's conservative 100-write guard. Mark-read uses bounded unread batches, with the client continuing them.

Storage sealing/deletion and OpenAI requests are not part of database transactions. Upload sealing may leave an unreferenced private file if the database commit fails. AI quota reservation commits before the provider call; provenance is recorded in a second transaction that rechecks manager membership. These are explicit recoverable boundaries, not cross-service atomicity claims.

Wallpaper requests use a synchronous reservation, an idempotent background worker, and authenticated reads of the saved result/error. Appwrite omits asynchronous execution response bodies, so the client must not use `getExecution().responseBody` to retrieve a wallpaper. The latest job state is stored in the existing private `ai_quotas` JSON record; current manager access and the requesting identity are checked again when reading the result. Deploy both the updated client and Function together; see the [wallpaper deployment follow-up](../docs/WALLPAPER_DEPLOYMENT.md).

## Incremental growth and current limits

There is no application-wide stored-state size limit. Each profile/post/message/comment/reaction/vote/etc. is an independent row, and media bytes live in Storage. Mutations load the entity/relationships needed for that command, not all project history; indexed queries and cursor pagination handle dependency lists beyond Appwrite's default 25 rows. Data in unrelated Circles does not enlarge a post write.

Individual entity JSON is limited to **32,768 UTF-8 bytes**, sufficient for the current validated text fields. Platform row/storage/quota limits still apply. The client currently receives bounded recent windows (100 posts/messages/polls/events per query batch, up to 50 scope IDs per batch; 100 notifications/discovery records). Older rows remain stored, but a load-older UI is not implemented. Highlights computed client-side describe this loaded window, not an authoritative count of arbitrarily old history. This limitation is separate from storage capacity and must be disclosed.

Ten-second polling remains instead of WebSockets. Very large membership lists, a single post with very many comments/reactions, broad joined-Circle lists and provider request quotas need hosted load testing and further cursor-driven UI work. No production-readiness or supported-user-count claim is made.

## Media, AI and cleanup

Source photos may be up to **200 MB**. They are decoded/re-encoded as JPEG at quality 0.95 and up to **4096 pixels** on the longest edge, preserving aspect ratio without upscaling and removing source EXIF/GPS. This optimizes the posted photo rather than retaining its original file. Very large pixel dimensions and unsupported formats can exceed a device's decoding capabilities. Videos support **250 MB and ten minutes** in the client. Storage plan and bucket limits still apply to the actual uploaded bytes; optimized photos can fit a smaller storage cap even when their source files exceed it. Server transcoding, duration validation and video metadata stripping remain future work.

Uploads use authenticated sequential **5 MiB chunks** with Appwrite's multipart protocol, progress, cancellation and offset recovery. Browser Blob slices and native temporary disk slices avoid loading a complete 250 MB video into a JavaScript ArrayBuffer. Cancellation first commits an owned tombstone under the upload guard, then deletes storage bytes only after a confirmed commit; a conflicting successful upload cannot lose its file. Canceled reservations do not use the unfinished-upload allowance and cannot be finalized. Retained tombstones allow cleanup to retry a failed physical deletion. Keep the app open during transfer; background uploads and resume across a full app restart are not implemented. Hosted native URI handling and real slow-network behavior still require device checks.

Uploads reserve an unguessable ID, upload owner-private bytes, then verify reservation ownership, MIME, size, chunk completeness and ACLs before sealing. Only ready owned files can be newly attached. Indexed `media_refs` rows track attachments. Authorized snapshots receive 60-second bearer URLs only after filtering; those URLs remain valid until expiry after revocation, and remote state is not persisted locally.

`npx tsx appwrite/cleanup.ts` counts registered unreferenced uploads older than 24 hours. `--apply` is a separate authorized destructive maintenance step. Cleanup uses each file's guard, rechecks indexed references inside its transaction, revokes readiness, commits, then deletes bytes. Individual tombstones permit retries. It does not delete arbitrary unregistered uploads or schedule itself. Monitor bucket abuse and quotas separately; tombstone compaction/background cleanup remain follow-ups.

AI previews require a server-only OpenAI secret with API billing and image-model access. The Function sends only the explicit visual prompt (3–1,000 characters) and fixed instructions to OpenAI. It generates a **1536 × 1024 WebP wallpaper** combining all requested interests, alongside a readable color palette. Private posts, chats, profiles, photos, and member records are never fetched for AI generation. Image generation is billed by OpenAI separately from a ChatGPT subscription. See [AI setup](../docs/OPENAI_SETUP.md).

The server reserves one active generation before calling OpenAI. Default limits are **50 successful wallpapers per user across Circles in a rolling 24-hour window** and **3 attempts per minute**. Failure releases the pending hold and does not consume the successful daily allowance, while attempts still count briefly to prevent rapid retries. Abandoned holds expire after ten minutes. Old `ai_quotas` timestamp arrays remain readable and are upgraded inside their existing JSON record, preserving the 25-table schema and existing content. Burst, daily, already-running, OpenAI billing/capacity, and storage failures return distinct actionable codes and reset/retry metadata.

AI runs outside Appwrite’s 60-second database transaction. A second guarded transaction rechecks current owner/admin status, stores an exact server-generated proposal, and records one successful generation. Exact completion retries are idempotent. A lost commit response triggers confirmation and one bounded completion retry without another OpenAI request. If the outcome remains unknown, the private artifact is retained and the response avoids promising an allowance refund. Definite failures attempt private-file cleanup and reservation release.

Wallpaper paths have the form `<safe Circle ID>/<request UUID>.webp`, mapped to that UUID in the separate private bucket. An authenticated `themeWallpaper` request receives a 60-second token only after a stable guarded server read confirms either current membership and the active wallpaper, or the requesting manager’s own unexpired preview. Another manager cannot read someone else’s pending preview. Applying AI content requires the exact recorded proposal for the same manager/Circle; extra fields, substituted paths, and client-created `source: 'ai'` labels do not manufacture provenance. Previously issued bearer URLs can remain valid until expiry after revocation.

The existing upload cleanup tool covers registered media uploads. It does not yet schedule cleanup of unused/replaced AI wallpapers; these remain private and may consume storage. Remove unreferenced wallpaper objects through the Storage API after checking both active themes and pending previews, and keep successful quota receipts for at least 24 hours.

Live calls and account deletion still fail explicitly pending their Appwrite implementations. Email recovery/verification UI is also not implemented. Local demo media and room self-preview remain available.

## Validation and release gate

```sh
npm run typecheck
npm run lint
npm test
npm run test:appwrite
npm run build:appwrite
npm run build:web
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

Appwrite tests execute actual domain rules, normalized mapping, repository and handler against a deterministic in-memory transport model. Tests cover growth beyond the old ceiling, targeted writes, pagination, independent guards, simulated conflicts, concurrent username claims, read-time revocation, rollback on over-budget fan-out, normalized reactions/options/votes/RSVPs, upload permissions and AI provenance. **The mock implements the intended conflict model; passing it does not prove Appwrite hosted transaction semantics, ACLs or query/index compatibility.**

Before real use: verify all indexes are available; directly attempt row/file access as an outsider; exercise two members plus an outsider; remove a member during reads/uploads; race two real transactions on the same guard and on separate Circles; race invitation redemption and username claims; inspect committed rows for partial writes; verify 5+ MB web/native uploads and expiring file URLs; test session restart/logout/expiry; and verify optional AI with a real server key. None of those hosted checks was performed by this coding task. No live resource was deleted, no credential created and no deployment or push made.

## Official references checked

- [TablesDB transactions, staging, conflict detection and plan limits](https://appwrite.io/docs/products/databases/tablesdb/transactions)
- [Cursor pagination and list defaults](https://appwrite.io/docs/products/databases/tablesdb/pagination)
- [TablesDB server SDK reference](https://appwrite.io/docs/references/cloud/server-nodejs/tablesDB)
- [Function JWT identity and dynamic keys](https://appwrite.io/docs/products/functions/develop)
- [Default-deny permissions](https://appwrite.io/docs/advanced/security/permissions)
- [Storage permissions](https://appwrite.io/docs/products/storage/permissions)
- [File tokens](https://appwrite.io/docs/products/storage/file-tokens)
- [Native SDK setup](https://appwrite.io/docs/quick-starts/react-native)
