# Circle Appwrite integration — normalized schema

Circle now uses Appwrite Auth, TablesDB, Storage and Functions. Local demo remains separate and unchanged. This coding task did not create credentials, deploy, push, delete cloud resources or transfer live data. The user confirmed prior usage was demo-only. Historical Supabase code remains preserved.

**The earlier single-row pilot is superseded. Do not deploy its archive or initialize `circle_state/main`.** The existing empty `circle_state` table may remain untouched; the new Function never accesses it. There is no global metadata payload or 900 KB aggregate ceiling.

## Exact setup contract

Use free TablesDB database **`circle`**, authenticated Function **`circle-api`**, and Storage bucket **`circle-media`**. No initial rows are required. The Function creates profiles, claims and guards transactionally when needed.

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

Storage bucket **`circle-media`**: file security enabled; bucket permission **create(users)** only; no bucket read/update/delete permissions; maximum file size **50,000,000 bytes**; extensions `jpg`, `mp4`, `mov`. Enable encryption and antivirus where the plan/file size supports them. The client uploads with its own read/delete file permissions; the server verifies and removes those grants before publication. Sealed files have empty permissions.

Function **`circle-api`**: **Node.js 22**, entrypoint **`dist/main.js`**, install command **`npm ci --omit=dev`**, timeout **60 seconds**, execute permission **users** only. No public/custom-domain invocation, guest/any execution, schedules or events are needed. Dynamic key scopes: **`rows.read`, `rows.write`, `files.read`, `files.write`, `tokens.write`**. Use a dedicated Circle project because these runtime key scopes apply project-wide.

Required Function variable: `CIRCLE_DATABASE_ID=circle`. Appwrite supplies `APPWRITE_FUNCTION_API_ENDPOINT`, `APPWRITE_FUNCTION_PROJECT_ID`, `x-appwrite-key`, and `x-appwrite-user-jwt`. Optional variables: `CIRCLE_PUBLIC_ENDPOINT` for public/custom media URLs; secret `OPENAI_API_KEY`; `OPENAI_THEME_MODEL` (default `gpt-4.1-mini`). No API key belongs in the client. The handler verifies `Account.get()` using the caller JWT before touching privileged services.

Enable email/password Auth. Register Web platforms for exact localhost/preview/production hostnames, and Apple/Android platforms for `app.circle.private`. Native uses the official native SDK and a development/release build; device session persistence still needs testing. Web uses the web SDK; a first-party/custom API domain may be needed for browser cookie restrictions.

## Setup and build tools

`provision.ts` creates only missing normalized resources and verifies existing column/index/permission compatibility. It never modifies/deletes existing resources or reads/writes `circle_state`. It does not create a project, credentials or a Function. Run only after authorization, in a private administrator terminal with `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `CIRCLE_DATABASE_ID` set. The temporary setup key needs the corresponding database/table/column/index read/create and bucket read/create scopes; it is separate from runtime Function scopes. Revoke it after setup. Do not paste keys into chat or source control.

```sh
npx tsx appwrite/provision.ts --create-missing
npm ci
npm run build:appwrite
```

Deployment is a separate approved action. Upload the contents of `appwrite/function/` including generated `dist/main.js`, `package.json`, `package-lock.json`. The prebuilt archive has those three paths at its root. Shared domain modules are bundled; runtime packages are node-appwrite and zod. Do not deploy unbundled TypeScript.

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

## Incremental growth and current limits

There is no application-wide stored-state size limit. Each profile/post/message/comment/reaction/vote/etc. is an independent row, and media bytes live in Storage. Mutations load the entity/relationships needed for that command, not all project history; indexed queries and cursor pagination handle dependency lists beyond Appwrite's default 25 rows. Data in unrelated Circles does not enlarge a post write.

Individual entity JSON is limited to **32,768 UTF-8 bytes**, sufficient for the current validated text fields. Platform row/storage/quota limits still apply. The client currently receives bounded recent windows (100 posts/messages/polls/events per query batch, up to 50 scope IDs per batch; 100 notifications/discovery records). Older rows remain stored, but a load-older UI is not implemented. Highlights computed client-side describe this loaded window, not an authoritative count of arbitrarily old history. This limitation is separate from storage capacity and must be disclosed.

Ten-second polling remains instead of WebSockets. Very large membership lists, a single post with very many comments/reactions, broad joined-Circle lists and provider request quotas need hosted load testing and further cursor-driven UI work. No production-readiness or supported-user-count claim is made.

## Media, AI and cleanup

Photos are decoded/re-encoded as JPEG up to 2560 px, preserving aspect ratio and removing source EXIF/GPS. Media is limited to 50 MB (50,000,000 bytes); video duration is client-limited to 60 seconds. Server transcoding, codec/duration validation and video metadata stripping remain future work. Test native URI handling and uploads larger than 5 MB against actual Appwrite chunked-upload behavior.

Uploads reserve an unguessable ID, upload owner-private bytes, then verify reservation ownership, MIME, size, chunk completeness and ACLs before sealing. Only ready owned files can be newly attached. Indexed `media_refs` rows track attachments. Authorized snapshots receive 60-second bearer URLs only after filtering; those URLs remain valid until expiry after revocation, and remote state is not persisted locally.

`npx tsx appwrite/cleanup.ts` counts registered unreferenced uploads older than 24 hours. `--apply` is a separate authorized destructive maintenance step. Cleanup uses each file's guard, rechecks indexed references inside its transaction, revokes readiness, commits, then deletes bytes. Individual tombstones permit retries. It does not delete arbitrary unregistered uploads or schedule itself. Monitor bucket abuse and quotas separately; tombstone compaction/background cleanup remain follow-ups.

AI previews require a server-only OpenAI secret. The function sends only the explicit design prompt (max 300 characters), reserves one-per-minute/ten-per-day quota, validates palette/contrast, rechecks manager access and records provenance. Applying an AI theme requires the exact recorded proposal. Failed calls consume their reservation. Private posts, chat, profiles and photos are never sent to OpenAI. See [AI setup](../docs/OPENAI_SETUP.md).

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
