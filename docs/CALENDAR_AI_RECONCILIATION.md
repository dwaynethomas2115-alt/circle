# Reconciled Luna calendar: source and deployment guide

Dwayne approved publishing/deploying Calendar AI **enabled**, using `gpt-6-luna`
with no alternate-model fallback. This supersedes the original prototype's
disabled-until-model-configuration gate. It does not authorize a billable test,
private-data upload, silent calendar save, credential creation, persistent access
expansion, or bypass of the denied Space archive transfer.

## Source reconciliation

Both implementations were independently available through the existing workspace
and the explicitly supplied GitHub branch. No denied archive was retrieved.

| Source                               | Commit                                     | Retained contribution                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original local implementation        | `7de5ca6a8a756e663b3c897974dc65b7acd9cc05` | Chat/history, strict attachment checks, editable civil dates/IANA timezone/reference date, DST gap/fold validation, keyed private sessions, editable proposals, per-event review and final snapshot confirmation |
| Published `calendar-ai-luna-rebuild` | `d44580974da974c28125a95e702f88e07197242c` | Durable analysis claims/results/save receipts, async dispatch/result polling, private `calendar_imports` records, full JPEG decoding with `sharp`, enabled Luna pin                                              |

The merge preserves both source histories. Its working starting point deliberately
kept the original files, then integrated the rebuild's ledger, transport, package,
record/schema and provisioning design. The rebuild's ISO-only editing, weaker
timezone validation, single-component scope reset, and loss of chat history were
not substituted for the original UI. Its published branch remains unchanged.

Further integration corrections include matching Circle/request IDs on both
analysis results and save receipts, bounded database-only completion retries,
uncertain-commit readback, provider streaming bounds, and exact replay checks.
Unrelated upload/recovery, Home/Highlights, wallpaper, authentication, private media,
and existing model/key configuration are preserved.

## Enabled behavior and API compatibility

The server's `CALENDAR_MODEL` is exactly `gpt-6-luna`. There is no calendar model
environment gate, daily AI-off switch, or alternate-model fallback. The existing
server-only `OPENAI_API_KEY` is used without inspecting or changing its value.
Existing palette/Sunburst settings remain independent and unchanged.

- `calendarCapabilities`: verifies current membership, configured key presence,
  `enabled: true`, pinned model, and review contract version 2.
- `analyzeCalendar`: claims actor + UUID + source hash durably before inference;
  repeated unchanged claims cannot start another provider call. It dispatches
  asynchronously, while the client polls matching `calendarResult` records.
- `saveCalendar`: requires the original analysis ID, every selected event's
  `reviewed: true`, final `confirmed: true`, current membership, and full valid
  batch data. Events and the immutable save receipt commit atomically.

The provider uses the original known Chat Completions endpoint and strict proposal
shape, pinned Luna, `store: false`, no tools, and at most 6,000 completion tokens.
Only database completion conflicts retry (three attempts with short delays), never
inference. Pending/uncertain requests reuse their UUID; terminal failures require
an explicit New analysis action before a new paid attempt.

The existing old backend does **not** implement these routes. Client preflight
rejects it before sending a source or dispatching inference. Ordinary/manual
calendar functionality remains compatible, but Calendar AI cannot work against
that backend. Therefore deploy and verify the backend/schema **before** promoting
the frontend to production. A preview is not production readiness.

## Data, limits, duplicate protection and cost

The original limits remain: text messages up to 4,000 characters, six context
messages of 2,000 each, one UTF-8 TXT/CSV file up to 12,000 bytes or static
JPEG/PNG/WebP up to 10 MiB/20 MP. Images become a validated JPEG up to 1,600px per
side and 120 KiB; the server fully decodes it under pixel limits. At most 20 future
timed events are proposed/imported. PDF, Office, ICS, HEIC, GIF, SVG, recurring,
all-day and past-event imports are unsupported. Dates, years, start/end times and
timezones must be resolved; ambiguous DST times need a matching explicit offset.
Every new/edited proposal still needs human review and final batch confirmation.

Analysis requests are bounded to 240,000 bytes. Ordinary requests remain 24,000;
the reviewed save wire allows 30,000 to accommodate receipt/review metadata, while
the original event-batch validator retains its 24KB input bound. Extracted results
are capped at 24,000 bytes before persistence; each row is capped at 32,768 bytes.

Matching normalized title, UTC start/end, and location skip existing Circle events,
including those beyond the recent 100-event projection. Description is not part
of this match. The original deterministic event IDs and shared Circle transaction
guards are retained. A saved request returns its same receipt on exact replay;
changed replay payloads are rejected. This is not semantic matching of reworded
events or a permanent prohibition on re-import after deletion.

Unlike the original transient-only prototype, `calendar_imports` stores source
hashes, actor/Circle IDs, timestamps, bounded extracted proposals and save receipts.
Raw source bytes/chat are not persisted by application code. Unsaved results are
retrievable by their owner/current Circle member for 24 hours. Expiry denies
retrieval; it does **not** physically delete the row or its proposal. Saved
receipts remove the proposal and retain receipt/hash metadata. Cleanup/retention
maintenance remains a future operational decision. Platform execution logging,
provider retention and OS picker caches remain separate from application storage.

Dot's supplied official Luna pricing evidence remains: text input $0.10 per
million tokens and output $0.50 per million, plus applicable image-token pricing,
long-context pricing and regional uplift. Example: 10,000 text input + 2,000 output
tokens is approximately $0.002 before image charges or applicable 10% EU uplift.
This is not a fixed per-calendar price or a billing ceiling. There is no hidden
daily spending cap. Every member can explicitly request analyses; changed/new
requests can incur new costs. A previously dispatched request may already have
incurred usage even if its response was lost.

Sources: [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[image cost guidance](https://developers.openai.com/api/docs/guides/image-cost-calculator).
Public documentation and configured key presence do not prove Circle's current
OpenAI project access, quota, actual charges, or extraction quality.

## Required schema and fresh live evidence

Existing Appwrite target: project `6ae3ee7000368dcb80e7`, database `circle`, function
`circle-api`, endpoint `https://fra.cloud.appwrite.io/v1`.

Dot freshly confirmed during this reconciliation:

- Active backend remains `6ae83ec3dcd06dd45b3c` (older performance code).
- `calendar_imports` exists and is empty, row security enabled, no table roles.
- Required non-array String columns are Available: `entity_id`, `scope_id`,
  `actor_id`, `related_id` at 128; `sort_at` at 32; `data` at 32768.
- Its exact-ID access needs no indexes. No permission or schema expansion is needed.
- Dot has restored authenticated dashboard access without requesting credentials.

These are Dot's live observations, not this executor's dashboard inspection. This
executor has Git read/push access but no Appwrite/Vercel authenticated connector;
its GitHub status API read was forbidden. It cannot independently certify active
deployment hashes or Vercel Ready/Current Production. Do not run the general
provisioner or create another table/bucket. The scoped `provision-calendar.ts`
script is read-only by default and has not been run against production here.

## Deployment sequence and transfer boundary

1. Publish the reviewed candidate on its own reconciliation branch and verify its
   exact remote SHA; preserve production main `bbddc69...` until backend readiness.
2. Use only independently authorized GitHub/local source from that exact candidate.
   Verify the three Git blobs below and build a **new** three-file archive at its
   root: `main.js`, `package.json`, `package-lock.json`. Never retrieve the denied
   Space archive, or change routes/credentials to evade its `403 scope_violation`.
3. The user must select the new bundle file or an allowed folder/file-transfer
   scope for Dot's existing manual upload workflow. No new persistent credential
   or integration is necessary. If that selection is unavailable, stop at this
   concrete bundle/source candidate and report the transfer blocker.
4. In the existing authenticated Appwrite dashboard, manually upload the new
   bundle to `circle-api`. Preserve Node.js 22, `main.js`, `npm ci --omit=dev`,
   180 seconds, execution users, existing scopes, secret key and model variables.
   The production function dependencies now include `sharp`.
5. Verify the new build succeeded and the exact candidate backend is Active, with
   the existing schema still private. A current authorized Circle member may
   call `calendarCapabilities` without a provider call: it must report enabled
   Luna and review contract v2. This proves configuration, not OpenAI acceptance.
6. Only then fast-forward existing GitHub main to the candidate, after reconciling
   any intervening commits. Dot must verify the exact Vercel production commit is
   Ready / Current and serves `circle-rho-smoky.vercel.app`; refresh old tabs.
7. Verify Luna project availability using authorized read-only account access when
   available. No synthetic billable extraction, private upload or calendar save
   was run here. Any such test needs its own explicit authorization/user action.

The archive-transfer restriction is still in force. Merely having an Appwrite
dashboard session does not authorize a denied file transfer. No PR creation was
attempted; the earlier denied draft-PR action was not retried.

## Fresh verification

Validation counts, candidate commit and exact bundle hashes are recorded in the
completion handoff below when finalized. Earlier original/rebuild counts are not
used as evidence for the merged source. All browser/provider tests are mocked;
no hosted calendar events, source uploads or paid provider calls were performed.
Native exports check bundling, not physical-device picker execution.

Fresh reconciled validation: **188 client/helper + 116 backend tests pass (304
total)**. All **23 calendar browser scenarios** and **seven private-media browser
regressions** pass (30 distinct mocked scenarios). TypeScript, ESLint, formatting,
diff checks, server bundle, and web/iOS/Android exports pass. The clean three-file
function package installs with `npm ci --omit=dev`; its native Sharp decode test
passes and its unauthenticated handler returns 401 with zero provider calls.

| File at archive root | Git blob SHA                               |
| -------------------- | ------------------------------------------ |
| `main.js`            | `b51d400899ee9277ec837e727a81dd9f52165db0` |
| `package.json`       | `d51860582cd7556f6b7b9c679008624e48910d4a` |
| `package-lock.json`  | `d58663154652e96acee8879c272759523bf66989` |

These are source-file Git blobs, not the archive SHA-256. The exact newly built
archive/checksum and published candidate commit are reported separately so they
can be checked without accessing the denied archive. Reproduce the browser checks
with [the reconciled harness](../e2e/calendar-assistant/README.md). Local evidence
is under `/tmp/circle-calendar-reconciled` and `/tmp/circle-calendar-reconcile-*.log`.
