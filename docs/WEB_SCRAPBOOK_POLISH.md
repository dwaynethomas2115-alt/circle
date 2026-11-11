# Website scrapbook polish — local review

Prepared on November 11, 2026, on local branch `review/web-scrapbook-polish`.
Baseline: public Circle main `8c2a7e3f73867e806b1c69f74bcfc75eb18ff643`.
This work has not been pushed or deployed. The separately maintained iPhone
checkout and its build configuration have not been changed.

## What changed

- Home keeps **Your Circles first**, then the feed. Compact photo tiles show
  Highlights activity, and memory cards have cleaner paper frames, captions,
  album presentation and room for controls at narrow widths.
- Highlights has a fan of real Circle photo prints, a matching desktop Home
  card, and a focused reel with a brief page-turn entrance. Arrow keys and Escape
  work; editable fields, sliders and video controls keep their own arrow keys.
  Reduced Motion removes the entrance and automatic progression. Hidden tabs
  pause progression. Watching does not automatically mark anything seen.
- **Plans** is now directly available in navigation. Members can select one of
  their approved Circles and use its existing calendar, RSVP controls and calendar
  AI. The month and agenda sit beside each other on desktop and stack on phones.
  Event cards use date tickets and clearer times, locations and attendance.
- Circle headers retain the small picture and compact Memories / Chat /
  Highlights tabs. The calendar's repeated title/action block was removed;
  Back to Circle preserves the previously selected tab.
- Shared controls have larger primary touch targets, visible keyboard focus,
  stronger secondary text and live Reduced Motion preference handling. Desktop
  navigation can scroll independently on shorter screens.

The existing albums, photo viewer, threaded comments, group chat, polls,
invitations, moderation tools, wallpaper settings and account flows remain.
These are adaptations of the existing website, inspired by the iPhone design;
they do not import the private native implementation.

## Privacy and draft behavior

Plans only offers approved member Circles. An unavailable/revoked selection shows
no calendar and never silently switches an open draft to another Circle. Account
and Circle changes unmount the previous calendar and its draft/AI proposals.
The existing calendar AI still requires editable proposal review and final save
confirmation; opening Plans or Highlights creates no events.

Highlights resolves frames against the current permitted feed. Deleted/revoked
posts disappear and replaced files/current signed URLs are used. Stable frame
identity avoids replaying the entrance solely because a token changed.

No private media cache, token lifetime, authentication or access-policy changes
were made. The existing image component may retain pixels already rendered
while a URL rotates; this does not make an expired URL reusable. Logout,
membership/account changes, fresh viewers and failed requests retain their
existing access checks and recovery behavior. No persistent private-media cache
has been added.

## Verification

All checks use local source, local demo data or explicitly mocked services:

- TypeScript and full ESLint: pass.
- Client automated tests: **192 passed**.
- Appwrite mocked server tests: **116 passed**.
- Full website browser suite: **30 passed**, no skipped or flaky cases.
- Existing private-media regression harness: **14 passed**, covering expired and
  failed URLs, fresh viewers, replacement/deletion, wallpaper access denial,
  role/account changes, logout, overlapping account/Circle requests, and absence
  of signed URLs in local/session storage.
- Additional visual/interaction review covered Home at 320/375/393/430/1440px,
  including simulated 130% browser text, plus Highlights and calendar layouts.
  Album image DOM identity remained stable while opening feed options.
- Production-style web export: pass. A separate export with dummy Appwrite
  settings was used for private-media mocks; no hosted requests were allowed.
- Backend bundle, state/auth/media engines, dependency manifests and platform
  configuration: unchanged from the baseline.

Four existing browser specs contained stale selectors for earlier navigation,
headings and signup/composer labels. They now target the verified current UI;
album persistence, permissions, actions and validation assertions remain.
The new web-polish spec adds layout, keyboard, reduced-motion, member-only Plans,
Circle draft isolation and text-size cases.

Normal commands:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run test:appwrite
EXPO_NO_DOTENV=1 EXPO_PUBLIC_BACKEND=demo \
  EXPO_PUBLIC_APPWRITE_ENDPOINT= EXPO_PUBLIC_APPWRITE_PROJECT_ID= \
  EXPO_PUBLIC_APPWRITE_FUNCTION_ID= CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm run build:web
```

Browser tests must run against an explicit local demo, without live credentials.
The dedicated private-media harness and its dummy export instructions remain in
`e2e/performance/README.md`. Local results are not hosted performance or physical
iPhone evidence. Day-cell widths still depend on the seven-column grid and
wallpaper margins; the primary navigation, reel and RSVP target checks should
not be read as a claim that every calendar day is 44px wide.

## Publication and review

Publication awaits Dwayne's approval. Recheck public main against the baseline,
review intervening work if it moved, and use a normal fast-forward publication
without overwriting unrelated changes. No private iPhone history is included in
this branch. Vercel will build the website on an approved main push.

**No Appwrite deployment, schema, variable, model, key, permission or storage
change is needed.** Preserve the currently deployed calendar backend and review
flow; do not upload an older function archive.

After an approved deployment, verify the exact commit is Vercel Current
Production / Ready. A member should then check Home albums, filter/sort, comments,
Circle chat/polls, Highlights play/pause/seen controls, and manual/calendar-AI
review before confirming any real event save. Check theme wallpaper placement and
the smaller browser widths too. Hosted signed-in flows have not been tested here.

This work adds no new native build, OS push notifications, exported video movie
or live video-call service. The existing Appwrite room limitation remains; local
camera self-preview is not a working multi-user call.
