# Circle performance: local review and deployment handoff

Prepared against published commit `310061ee71ddb7ade7026ec8e44cc616cd5bde58`.
The remote matched that commit when work began; no intervening source changes
needed reconciliation. Dwayne subsequently approved publication/deployment of
this scoped performance fix. The final handoff records the verified remote
commit; Dot coordinates and verifies deployment. This approval does not cover
unrelated changes or production configuration changes.

## Findings and changes

Dwayne reported slow loading and photos reloading while scrolling. This report
was not reproduced in an authenticated hosted account. Local testing separates
several confirmed code behaviors from remaining hypotheses:

1. **Background refreshes replaced photos.** The existing 10-second snapshot
   check returns fresh 60-second media URLs. The photo component keyed its Image
   by the entire URL and reset its loading state whenever the signature changed.
   In the controlled browser fixture, three refreshes caused 60 photo requests
   and 60 photo DOM replacements. Vertical scrolling alone caused neither.
2. **Albums unnecessarily remounted photos.** Moving beyond the neighboring
   pages unmounted earlier pages; changing the active page also changed an
   image's parent from Pressable to View. Returning through an album caused
   eight image-node remounts in the fixture. Browser decoded-image reuse meant
   this did not itself produce additional HTTP requests in that test.
3. **Media authorization I/O was serial.** Each upload reservation was loaded
   one at a time, then each unique media token was minted one at a time. These
   stages now run with a maximum of six independent operations at once. The
   existing request-local deduplication, ready-upload validation, fresh authorized
   projection, and guard-conflict checks remain intact. Ordinary feature reads
   no longer load media reservations they never use.
4. **Slow feature refreshes could starve their own results.** A request taking
   longer than the 10-second poll interval was superseded by another request;
   successful older results were discarded. Identical reads now share an
   in-flight request scoped to actor and membership/role. Mutations still force
   a new read; old scopes and failed/invalid responses cannot publish data.
5. **Web foreground events duplicated work.** React Native Web already maps
   visibility changes to AppState. Listening to both started duplicate account,
   snapshot, and wallpaper reads. Each platform now uses one foreground source.
   Wallpaper requests also coalesce while a same-scope read is pending. Feature
   polling pauses in hidden tabs and refreshes on return.
6. **Cold loading waited for fonts before checking the account.** Providers now
   start those requests while fonts load. The existing Navigator/Gate remains
   hidden until fonts are ready; account/snapshot identity checks, recovery,
   redirects, and the persistent navigator structure are unchanged.

Loaded photos, covers, avatars, and wallpapers retain their mounted image across
signature changes for the same file, project, rendition, and access scope. New
mounts, changed resources, failed requests, and explicit retries use the latest
authorized URL. Image dimensions come from metadata, the native load event, or
the already-loaded web Image's own DOM node instead of a separate `Image.getSize`
probe. A platform adapter handles RN Web's async load event losing its target;
one-shot DOM listeners are cleaned up on error, retry, or unmount. Albums retain visited pages, bounded by their
existing maximum of ten photos, and keep the parent element stable.

Web galleries activate within 800 pixels of the nearest scrolling viewport and
then stay mounted. This defers heavy offscreen image/video work without tearing
it down as the user scrolls back. Native and browsers without IntersectionObserver
retain normal eager rendering. Known-dimension placeholders match the media
frame; missing dimensions can still cause the existing aspect-ratio adjustment
when an image first loads.

## Privacy and expiry

- The main 10-second account/snapshot check is unchanged. No snapshots are served
  from a new client cache, and account checks were not skipped or overlapped with
  unauthenticated snapshot requests.
- Server tokens still expire after 60 seconds. There is no cross-request server
  token cache, new global image cache, persistent bearer URL, blob, or media store.
- An already rendered photo can stay on screen across signature rotation. Its
  old URL does not gain more time or permissions. New network reads remain
  subject to Appwrite's token expiry and the current authorized projection.
- Revocation blocks new token issuance and removes the private UI when a fresh
  access check detects it. Previously issued URLs retain only their existing
  original lifetime; this change does not claim instant invalidation of those
  tokens or reuse of expired tokens.
- Actor/auth/membership/role and resource changes discard the old rendered
  image. Revoked memberships, blocked/deleted posts, unknown authentication, and
  wallpaper refresh failures retain their existing fail-closed render behavior.
  This does not claim to erase browser/OS caches, screenshots, or bytes already
  delivered to a person.
- Private buckets/files, database schema, credentials, execution permissions,
  scopes, storage settings, models, billing, and plans are unchanged. No new
  dependencies were added.

## Controlled measurements

These are local synthetic results, not hosted speed promises. Browser fixtures
use sample accounts/media, intercept or block external traffic, rotate fake
private tokens, and disable HTTP caching through Playwright routing. Before and
after run against the same fixture and immutable baseline bundle. Counts and
timings are recorded in `/tmp/circle-performance-smoke/`.

The browser comparison uses 12 posts (eight four-photo albums and four single
photos), 70 ms mocked service/image latency, 390px for scrolling and 1440px for
album navigation:

| Measurement                                                                     |        Published baseline |         Local fix |
| ------------------------------------------------------------------------------- | ------------------------: | ----------------: |
| Initial private image requests                                                  |            24 (20 photos) |      8 (4 photos) |
| Additional photo requests during three 10-second background refreshes           |                        60 |                 0 |
| Photo DOM replacements during those refreshes                                   |                        60 |                 0 |
| Account checks / snapshots during the same initial + three-refresh window       |                     4 / 4 |             4 / 4 |
| Image remounts returning to visited album pages                                 |                         8 |                 0 |
| Account reads / snapshots from one foreground event                             |                     2 / 2 |             1 / 1 |
| Wallpaper reads from that foreground event                                      |                         2 |                 1 |
| Concurrent requests when a feature response takes 11 seconds                    | 2, first result discarded | 1, result applied |
| Account request start relative to last font completion with 500 ms font latency |               19 ms after |     514 ms before |

First-time scrolling in the new fixture intentionally loads five additional
deferred photos. Repeating that scrolling adds zero photo requests. Baseline
vertical scrolling itself also added zero requests; the reproduced reload trigger
was token rotation, not scrolling. Album return had zero extra HTTP requests in
both versions because browser decoded-image reuse was effective; the improvement
there is removal of unnecessary remounts, not a claimed bandwidth saving.

The portable server benchmark uses 18 files, 20 ms mocked latency per reservation
read and token mint, and three runs per version. The baseline and new code each
perform 18 reads and 18 token calls. Median time for those stages was **731 ms →
123 ms** (about 83% less); peak concurrency was **1 → 6**. This measures those
stages only, not function cold starts, full database queries, image downloads, or
end-to-end hosted load time.

Reproduce without any service credentials or live requests:

```sh
npx --no-install tsx appwrite/benchmarks/media-performance.ts \
  --output=/tmp/circle-media-performance/reproducible.json
```

The benchmark reads baseline source with `git show`, does not check out another
version, and disables live fetches. Regression tests use deterministic gates
rather than asserting machine-dependent speed thresholds.

## Validation and limitations

143 client/helper tests and 89 Appwrite tests passed. TypeScript, ESLint,
`git diff --check`, web export, and iOS/Android bundle exports passed. Native
exports check bundling, not gestures or device performance. New tests
cover image identity/access scope/dimensions, scoped refresh races and failures,
bounded media concurrency, duplicate references, expiry, authorization guards,
revoked/blocked/deleted content, unready uploads, and unused feature reservations.

Eight performance/access scenarios and fourteen distinct extended browser
regressions passed. They are recorded in
`/tmp/circle-performance-smoke/final-report.json` and
`/tmp/circle-performance-smoke/final-regressions-report.json`:

| Case                              | Assertion                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Expired URL / fresh mount         | The fixture rejects the old token as expired. A newly opened viewer requests the current token; keeping the already-rendered feed photo steady does not reuse the expired token for that new read. This simulates expiry rejection, not live Appwrite clock enforcement. |
| Failed URL / automatic recovery   | A rejected photo request shows an error without an automatic retry loop. A new authorized URL from a later snapshot restores the photo.                                                                                                                                  |
| Manual retry                      | Explicit retry uses the latest current authorized URL after a transient failure.                                                                                                                                                                                         |
| Replaced file                     | A different file identity replaces the rendered resource instead of retaining the old photo.                                                                                                                                                                             |
| Deleted reference                 | An authorized snapshot omitting the deleted attachment removes that photo. No live storage deletion was performed.                                                                                                                                                       |
| Missing-resource snapshot failure | A mocked snapshot 404 clears private media through the existing recovery path. This is a failure simulation, not a claim about which exact error hosted deletion returns.                                                                                                |
| Membership revoked                | The new membership projection removes the private journal, cover, and wallpaper; further scrolling cannot load its old feed. Server projection tests also prove no new token is minted for revoked membership.                                                           |
| Logout                            | One intercepted fake session DELETE clears private media/session UI. No real Appwrite session was changed.                                                                                                                                                               |
| Role reduced                      | The image access scope resets; the old rendered instance is not retained across the role change.                                                                                                                                                                         |
| Account changed                   | A verified account with no memberships cannot retain the earlier account's private media.                                                                                                                                                                                |
| Overlapping account reads         | The fixture captures actor A's actual snapshot payload at request start, holds it until verified actor B's no-membership UI is visible, then releases it. A's private media/theme cannot reappear.                                                                       |
| Overlapping Circle image reads    | Family photo bytes are held while the client router opens Other Place, then released after the new Circle is visible. The prior Circle's image cannot reappear there.                                                                                                    |
| Wallpaper denied                  | A mocked 403 clears the previous wallpaper even while the parent still reports membership.                                                                                                                                                                               |

The older-photo case also passes: the actual browser portrait frame has the
preserved clamped ratio 0.78 instead of the default 1.62, using the existing DOM
image with no second size request. After refreshes and opening a viewer,
localStorage and sessionStorage contain zero keys and no mock signed media
URL/token; that assertion does not cover normal browser HTTP/OS caches.

Persistent regression sources include
`src/lib/imageLoading.test.ts`, `src/lib/imageDimensions.test.ts`,
`src/lib/scopedRefresh.test.ts`, and `appwrite/tests/media-performance.test.ts`.
They additionally check endpoint,
project, file/rendition identity, original 60-second expiry arguments, stale
refresh/error rejection before effect cleanup, and authorization-guard conflicts.

The browser harness and synthetic fixture are preserved in `e2e/performance/`;
see its README for exporting a dummy-backend build, the loopback-only SPA server,
full runs, and focused reruns. It intercepts the fake Appwrite origin, blocks all
other external requests, and refuses a hosted base URL. The portable expiry,
logout, delayed account/Circle responses, and storage subset also passed (five
reruns of the same cases, not five additional distinct scenarios), recorded in
`/tmp/circle-performance-portable/portable-report.json`.

There was no live sign-in mutation, reset email, account creation, invitation,
personal upload, generation, paid provider call, credential handling, or dashboard
change. Hosted signed-in behavior, physical iPhone/Android devices, real network
latency/cache headers, Appwrite cold starts, and production throughput remain
unmeasured. The web feeds still use ScrollViews; this patch defers heavy media
rather than introducing a nested FlatList or a full native list migration. Very
long feeds and older/low-memory devices may still need separate profiling.

## Approved publication and Dot deployment

1. Reconcile any newer remote commits and publish the reviewed local change by
   normal fast-forward workflow under Dwayne's approval for this fix. A push can
   trigger Vercel. Confirm Vercel `dwayne7/circle` is Ready / Current Production at the
   exact published commit and serves `circle-rho-smoky.vercel.app`.
2. The server performance change also needs an Appwrite function update. Package
   only these three files from that same commit at archive root: `main.js`,
   `package.json`, `package-lock.json` from `appwrite/function/`. Upload to the
   existing project `6ae3ee7000368dcb80e7`, function `circle-api`, through Dot's
   established manual archive workflow. No schema, bucket, model, credential,
   permission, billing, or plan changes are required.

   Git blob hashes for the reviewed bundle files:

   | Archive-root file   | Git blob SHA                               |
   | ------------------- | ------------------------------------------ |
   | `main.js`           | `8fcc31ca0586b05af9e23d1c433d1c342fa717fb` |
   | `package.json`      | `179070395e599eeae177b52c4dddf5746d7b5b27` |
   | `package-lock.json` | `54785bc26284ff14eb3b23b2161b5ae74fbe3c93` |

3. Preserve Node.js 22, `main.js`, `npm ci --omit=dev`, 180-second timeout, and all
   existing configuration. No environment variable needs adding or changing.
   Verify the new deployment is ACTIVE and retain the prior deployment for
   rollback. Review public UI read-only; do not send emails/invitations, upload
   personal media, or run generation as part of deployment verification.
4. Refresh old tabs after the matching website build. With a separately approved
   existing-account read-only test, compare repeated scrolling and background
   refreshes, album return, and navigation. Do not treat local fixtures or a
   successful deployment as proof of hosted performance or revocation behavior.
