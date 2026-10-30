# Circle

Your people. Your shared story. A private digital scrapbook with a group chat, threaded conversations, and memories to revisit, built with **Expo SDK 54, React Native, TypeScript, Expo Router, and Appwrite**. Shared screens run on iOS, Android, and web; the wider web layout adds navigation and a community sidebar.

## One shared workflow

Use this GitHub repository's **`main` branch** as the shared source for Circle. Appwrite provides accounts, private data, media and the authenticated server function. Vercel hosts the website and automatically rebuilds it when `main` changes. Codespaces is an optional editor; its uncommitted files are not visible to other workspaces.

Follow [the Vercel connection guide](docs/VERCEL_SETUP.md) to connect the website once. Subsequent website updates go through GitHub. Appwrite Function updates have their own deployment step; a Vercel website build does not deploy that server code. Keep public Appwrite connection settings in Vercel, and server secrets in Appwrite Function variables.

## Run the interactive demo

Requires Node.js 22.18+ (validated on 24.19) and npm. From the repository root:

```sh
npm ci
npm run web
# or start Expo and open on an iOS/Android device with a compatible Expo Go client:
npm start
```

Without Appwrite configuration, Circle opens as Alex Morgan in an explicitly labeled **LOCAL DEMO**. All people, photos, conversations, and communities are fictional examples. Sign out to see welcome and signup. You can create another adult demo account, but demo sign-in is email-only and is **not authentication**. There is no server-enforced privacy or cross-device/multi-user messaging in demo mode. Use only sample content.

The demo includes Anastasia’s Circle, School Parents Circle, Football Friends, Neighborhood Circle, and the discoverable Weekend Club. Alex owns Football Friends, where a pending request demonstrates approvals and role management. Discover the Weekend Club to request membership. Demo invitation `FAMILY2026` is single-use and expires seven days after the first seeded session. A Circle manager can generate fresh invitations in Members or Settings.

The demo persists records in AsyncStorage and stores chosen web media locally in IndexedDB. Browser storage can be cleared by the user or browser. Bundled photographs work offline; see [asset attribution](assets/ATTRIBUTION.md).

### Cloud workspace

In restricted cloud machines without a writable home directory, use a writable npm cache and disable Expo telemetry and online version discovery:

```sh
npm ci --cache /tmp/circle-npm
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run web -- --port 8081
```

Offline mode skips Expo's online dependency-version lookup; it does not disable TLS or package integrity checks. The committed lockfile pins dependencies. After reinstalling dependencies, restart any running Expo process; add `--clear` once if Metro retained stale module-resolution entries. Use the existing checkout at `/workspace/circle`; each cloud task is isolated and does not need another Git worktree.

## Screens and local demo features

- Warm paper styling, large mounted photographs, quieter borders, captions below the media, and readable discussion threads. Home has Journal/Photos views, Circle filtering, text search, and chronological sorting.
- Circle journals have month filters and dated chapters for revisiting loaded memories; compact Circle chat headers put the conversation first.
- Welcome, adult signup/sign-in, profile editing/photo, logout, and account deletion confirmation.
- Circle creation with avatar/cover, category, description, discoverability, and approval settings.
- Joined/discoverable/pending Circles, join requests, approve/reject, private single-use invitation codes, member removal, admin/moderator roles, and leave flow.
- Text/photo/video posts and albums of up to ten photos, heart reactions, threaded comments and replies, author deletion, content reporting, blocking, and moderator report review/removal. Album selection supports adding, arranging, removing, and choosing the cover photo; published albums support swiping, page controls, and full-screen navigation.
- Circle group messages with sender identity, timestamps, deletion, and authorized polling in Appwrite mode.
- In-app notifications and read controls for invitations, requests, approvals, posts, reactions, and comment/reply activity. Push delivery and direct messages are outside this MVP.
- Loading, empty, error, unauthorized, and removed-content states; bundled typography and imagery.

Circle now also includes:

- **Better media:** source photos up to 200 MB, processed into high-quality JPEGs up to 4096px without upscaling; videos up to 250 MB and ten minutes. Photos retain portrait/landscape proportions and remove original EXIF/GPS; the source file is not retained. Device decoding support and the storage provider's plan still apply. Private media links refresh without restarting an active video.
- **Highlights:** private counts of posts, messages, comments and polls since your last reviewed visit; upcoming events; and a playable montage of shared photos, videos, and text. This montage is an in-app slideshow; it does not export a newly rendered video file.
- **Calendar:** accessible from the Circle header, with a month view, member-created events with local time entry, and going/maybe/not-going RSVPs.
- **Polls in group chat:** 2–6 options, one changeable vote per person, actual result counts, optional expiry, and author/manager close/delete controls.
- **Circle wallpapers:** owners/admins describe everyone's interests in one prompt. The Appwrite Function asks OpenAI to combine them into a colorful illustrated wallpaper with matching readable interface colors. Preview before applying. The image fills the Circle backdrop and a prominent hero area; Home retains its usual style. Local demo does not generate AI images, and older saved palettes remain readable.
- **Circle room:** accessed through the header’s **Join room** button; drop-in group voice/video on the web uses LiveKit. Microphone and camera start off; local demo offers only a self-preview, with no remote users or simulated presence. Appwrite live calls are not ported yet; joining returns an explicit error. Native currently opens the same Circle in a configured browser app; native in-app WebRTC calling has not been implemented.

The default appearance is light. Dark mode, push notifications, subscriptions, direct messaging, and child accounts remain outside this version. Month browsing covers the currently loaded recent history; the app does not yet load all older server rows.

The [scrapbook update deployment notes](docs/SCRAPBOOK_UPDATE.md) cover the website changes and the small Function update needed for multiple-photo posting. Albums use the existing private media bucket; older Functions continue supporting single-photo/video posts and reject an album before any upload, preserving its draft.

## Connect Appwrite

Follow [the Appwrite setup, security and migration guide](appwrite/README.md). The new remote integration is a **normalized integration**, with real Appwrite email/password authentication and server-enforced private-circle rules. It is not production-ready or feature-complete. Local demo retains all its existing screens/features.

Appwrite mode supports Circles, roles/invitations, text/photo/video feed, chat/comments, reactions, reports, polls, Calendar, Highlights and server-generated AI wallpapers. Live calls and account deletion remain explicitly unavailable pending further implementation. Updates use 10-second polling. Database entities are stored as independent indexed rows, with media in private Storage. The guide documents recent-window UI limits, the transaction budget and required hosted verification.

The active client uses Appwrite only. The `supabase/` directory retains historical backend code and tests for reference; its migrations are not part of the current setup. Consolidating the source does not move or erase existing hosted Appwrite data. Live server deployment and Vercel account connection still require access to the configured accounts.

## Architecture

```text
app/                         Existing Expo Router screens and auth gate
src/state/demo.tsx           Local demo persistence (unchanged)
src/state/model.ts           Shared pure domain transitions
src/state/remote.tsx         Appwrite Auth and authorized server snapshots
src/lib/appwrite.ts          Public configuration and Functions execution
src/lib/appwriteSdk*.ts      Web/native SDK selection and session handling
src/features/remote.tsx      Appwrite feature commands and polling
appwrite/function/           Authenticated server rules, validation and transactions
appwrite/provision.ts        Explicit fresh-schema setup script (not run)
appwrite/tests/              Server authorization and handler boundary tests
supabase/                    Retained historical SQL/functions/tests
```

## Validation

```sh
npm run lint
npm run typecheck
npm test
npm run test:privacy
npm run test:e2e
npm run build:web
```

Install Chromium for Playwright once with `npx playwright install chromium`, or select an existing binary:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

Playwright starts/reuses the web development server on port 8081 and exercises the unchanged local demo with fresh browser storage. Unit tests cover shared domain rules and persistence. `test:privacy` now runs Appwrite authorization tests; `test:legacy-supabase` retains the historical embedded SQL checks.

**Validation limits:** Appwrite tests use local domain rules and mocked transport. A configured Appwrite project and real sessions/devices are required to verify deployment, ACLs, cookies, hosted transactions and cross-device behavior. See the [Appwrite guide](appwrite/README.md) for a hosted acceptance checklist and explicit remaining feature gaps.
