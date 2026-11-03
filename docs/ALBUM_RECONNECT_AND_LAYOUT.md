# Album reconnect fix and content-first layouts

This change is prepared locally for review. Do not publish or deploy without
Dwayne's subsequent approval. The inspected base is
`15a71dde4d4972bd395bbbe8cbc50d66b644da83`.

## Cause: reproduced locally, hosted request still unknown

Every upload reservation/finalization transaction updates the uploading user's
authorization guard. A concurrent snapshot correctly returns HTTP 409 when its
before/after guard values differ: its projection may no longer be valid. Albums
upload sequentially and involve repeated reservation/finalization transactions,
so they create more opportunities to overlap the existing background refresh.

The client previously treated that temporary read conflict as an unknown
connection state. The recovery gate then removed private screens, unmounting the
composer, aborting its upload, and losing its component-only draft.

Tests reproduce the conflict with the actual Repository and an in-memory fake
database, and reproduce the reconnect/draft-loss behavior through the browser
composer with two local JPEG selections and intercepted Appwrite responses. This
does not establish the status or request ID of Dwayne's hosted failure: no hosted
network trace or execution log was supplied.

## Targeted correction

- Retry only a snapshot's 409, at most twice after the initial attempt, with
  100/200ms delays. Each attempt freshly checks the account and requests an
  entirely new authorized projection. Never replay post creation or upload writes
  as part of this retry. The backend guard remains unchanged.
- All non-409 errors, exhausted conflicts, identity mismatches, and sign-out keep
  their existing fail-closed behavior. Account/membership polling continues.
- Keep one composer draft in provider-lifetime memory above the recovery gate.
  It includes the caption, local selections, ordering, selected photo, and target
  Circle; it is not stored in localStorage/sessionStorage or on disk.
- Hide private UI during uncertainty. Restore local input only after a fresh
  matching account and current membership in the target Circle. Sign-out,
  explicit account deletion, account changes, and verified revocation clear it.
  Late picker callbacks and completions cannot overwrite another draft.
- A selected target Circle is retained even when the user changed it after
  opening a Circle-specific composer link. An unrelated explicit Circle route
  cannot restore that input.
- Recovery never automatically submits a draft. A confirmed post success clears
  its saved draft even if the post-write refresh failed. A lost final post
  response remains an ambiguous outcome; this change does not add write
  idempotency or claim automatic duplicate prevention for an unconfirmed commit.
  After verification, the app may open the confirmed post; reopening Add memory
  starts without that already-posted draft.

The store accepts local file/blob/data/content/photo-library URIs only. It does
not cache signed media URLs, backend snapshots, or reusable private access.
Closing/reloading the app loses this in-memory recovery draft. Manual retry starts
a new upload attempt; this change does not add cross-attempt upload resumption.
Existing private files are not rewritten, deleted, or made public.

## Requested layouts

- The signed-in home screen is `app/index.tsx`; public `app/welcome.tsx` is
  untouched. Home now starts with Your Circles, then the picture/journal feed.
  The introductory hero and large composer are removed. Existing view, order,
  and Circle filters remain behind Feed options. Add memory remains in app
  navigation; desktop secondary Highlights/chat content remains available.
- `src/features/HighlightsPanel.tsx` now presents the playable montage and actual
  updates before the informational summary. Membership checks and existing
  progress-saving behavior remain intact.

## Verification

- 160 client/helper tests and 91 backend tests pass. The new backend tests use
  fake services; no deployed backend or storage is contacted.
- TypeScript, ESLint, formatting, and diff checks pass. Web/iOS/Android exports
  pass; these are bundling checks, not physical-device tests.
- Fourteen browser scenarios pass using real file selection, preparation, and composer code,
  with every Appwrite upload/action/read intercepted. It covers two- and ten-photo
  albums, a conflict while photo two is uploading, persistent failures and manual
  draft restoration, upload failure without a partial album, changed target
  Circle, confirmed posting followed by refresh failure, account changes,
  revocation/sign-out, and mobile Home/Highlights ordering at 320/390px.
- Seven existing private-media browser scenarios pass, checking account failures,
  revocation, overlapping account/Circle reads, and absence of signed media in
  browser storage.
- One additional mocked desktop layout check passes for Home and Highlights.
  That makes 22 distinct final mocked-browser scenarios, plus a separate baseline
  reproduction demonstrating the old reconnect/draft-loss behavior.

Reproduction: [album browser checks](../e2e/album-recovery/README.md).
Local evidence is under `/tmp/circle-album-recovery`, with unit/backend/build logs
under `/tmp/circle-album-*.log`. All evidence is local/mocked. No live uploads,
emails, invitations, provider requests, paid generation, or dashboard actions
were performed. Hosted behavior and native gestures remain unverified.

## Deployment needs after approval

Frontend publication would trigger Vercel. Verify Current Production Ready at the
exact approved remote commit before calling it live. Refresh existing tabs after
deployment. No Appwrite function source or bundled files changed, so no Appwrite
archive or redeployment is needed. Models, keys, scopes, file permissions,
database/storage settings, environment variables, billing, and plans are unchanged.
