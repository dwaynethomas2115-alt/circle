# Circle

Your people. Your place. A mobile-first private-community app built with **Expo SDK 54, React Native, TypeScript, Expo Router, and Supabase**. Shared screens run on iOS, Android, and web; the wider web layout adds navigation and a community sidebar.

## Run the interactive demo

Requires Node.js 22.18+ (validated on 24.19) and npm. From the repository root:

```sh
npm ci
npm run web
# or start Expo and open on an iOS/Android device with a compatible Expo Go client:
npm start
```

Without Supabase configuration, Circle opens as Alex Morgan in an explicitly labeled **LOCAL DEMO**. All people, photos, conversations, and communities are fictional examples. Sign out to see welcome and signup. You can create another adult demo account, but demo sign-in is email-only and is **not authentication**. There is no server-enforced privacy or cross-device/multi-user messaging in demo mode. Use only sample content.

The demo includes Anastasia’s Circle, School Parents Circle, Football Friends, Neighborhood Circle, and the discoverable Weekend Club. Alex owns Football Friends, where a pending request demonstrates approvals and role management. Discover the Weekend Club to request membership. Demo invitation `FAMILY2026` is single-use and expires seven days after the first seeded session. A Circle manager can generate fresh invitations in Members or Settings.

The demo persists records in AsyncStorage and stores chosen web media locally in IndexedDB. Browser storage can be cleared by the user or browser. Bundled photographs work offline; see [asset attribution](assets/ATTRIBUTION.md).

### Cloud workspace

In restricted cloud machines without a writable home directory, use a writable npm cache and disable Expo telemetry and online version discovery:

```sh
npm ci --cache /tmp/circle-npm
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run web -- --port 8081
```

Offline mode skips Expo's online dependency-version lookup; it does not disable TLS or package integrity checks. The committed lockfile pins dependencies. After reinstalling dependencies, restart any running Expo process; add `--clear` once if Metro retained stale module-resolution entries. Use the existing checkout at `/workspace/circle`; each cloud task is isolated and does not need another Git worktree.

## What is implemented

- Responsive home feed with Circle filtering and text search; private Circle feed and separate chat.
- Welcome, adult signup/sign-in, profile editing/photo, logout, and account deletion confirmation.
- Circle creation with avatar/cover, category, description, discoverability, and approval settings.
- Joined/discoverable/pending Circles, join requests, approve/reject, private single-use invitation codes, member removal, admin/moderator roles, and leave flow.
- Text/photo/video posts, heart reactions, threaded comments and replies, author deletion, content reporting, blocking, and moderator report review/removal.
- Circle group messages with sender identity, timestamps, deletion, and Supabase change subscriptions.
- In-app notifications and read controls for invitations, requests, approvals, posts, reactions, and comment/reply activity. Push delivery and direct messages are outside this MVP.
- Loading, empty, error, unauthorized, and removed-content states; bundled typography and imagery.

Circle now also includes:

- **Better media:** photos up to 200 MB input, processed at up to 4096px without upscaling and high JPEG quality; videos up to 250 MB and 10 minutes with playback controls. Full-size viewing preserves portrait/landscape proportions. Photos are re-encoded to remove source EXIF/GPS; the original file is not retained. Available device memory and supported image formats still constrain decoding very large photos. Remote uploads use bounded 6 MiB resumable chunks, progress, and retry; the storage provider’s own file-size and capacity limits still apply.
- **Highlights:** private counts of posts, messages, comments and polls since your last reviewed visit; upcoming events; and a playable montage of shared photos, videos, and text. This montage is an in-app slideshow; it does not export a newly rendered video file.
- **Calendar:** accessible from the Circle header, with a month view, member-created events with local time entry, and going/maybe/not-going RSVPs.
- **Polls in group chat:** 2–6 options, one changeable vote per person, actual result counts, optional expiry, and author/manager close/delete controls.
- **Circle wallpapers:** owners/admins describe their Circle in a single prompt. OpenAI generates a colorful illustrated wallpaper combining the requested interests, plus readable matching interface colors. Preview before applying; the image fills the Circle backdrop and a prominent hero area. Home retains Circle’s base style. Images are private and require server configuration. Local Demo never pretends to generate an image; older saved palettes remain supported.
- **Circle room:** accessed through the header’s **Join room** button; drop-in group voice/video on the web uses LiveKit. Microphone and camera start off; local demo offers only a self-preview, with no remote users or simulated presence. Real calls require configured Supabase, LiveKit, and reliable removal delivery. Native currently opens the same Circle in a configured browser app; native in-app WebRTC calling has not been implemented.

The default appearance is light. Dark mode, push notifications, albums, subscriptions, direct messaging, and child accounts remain outside this version.

## Connect Supabase

Follow [the backend setup and security guide](supabase/README.md), including the account-deletion Edge Function deployment.

1. For a fresh Supabase project, apply the files in `supabase/migrations/` in filename order. Existing Circle projects should apply only pending migrations, including `202610300001_circle_wallpapers.sql` and `202610300002_large_media.sql`. `supabase db push` on a linked project tracks pending migrations.
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the public project URL/key. **Never put a service-role key in the app.** Both values must be configured; restart Expo after changing them.
3. Configure email confirmation and redirect URLs in Supabase Auth. Deploy the `delete-account` Edge Function described in the backend guide.
4. In this cloud environment, add the exact project hostname (`<project-ref>.supabase.co`) to environment Internet access if required. Public configuration variables are build-time Expo settings; they are not secret credentials.
5. Sign up two real adult test users and complete the hosted two-user checks in the backend guide. Remote mode starts empty and never copies demo identities/content into Supabase.

Chat polls/calendar/Highlights need the community-features migration. For real AI wallpapers, follow the [beginner OpenAI setup guide](docs/OPENAI_SETUP.md) and [backend feature setup](supabase/FEATURES.md): apply the wallpaper migration, update the `generate-circle-theme` Edge Function, and rebuild the app. A GitHub push alone does not deploy SQL or Edge Functions. The OpenAI key belongs only in Supabase Edge Function secrets. For live rooms, follow [LiveKit setup](supabase/ROOMS.md), including signed provider webhooks, durable membership-removal retries, and the fail-closed enablement switch. These services may incur provider charges. Only an explicit theme description is sent to the AI provider, never private posts, media, or chat.

When configured, the provider switches to Supabase; all app operations use real Auth, PostgreSQL RLS, private Storage, and Realtime. Backend/schema failures appear as errors and clear cached private feed/chat data. There is no silent fallback to demo data.

## Architecture

```text
app/                       Expo Router screens and root auth gate
src/ui/                    Design tokens, reusable cards, avatars, shell, posts
src/types.ts               Shared domain models
src/state/CircleProvider    Chooses demo or Supabase provider
src/state/model.ts         Pure local-demo transitions and authorization simulation
src/state/demo.tsx         Serialized local persistence and demo actions
src/state/remote.tsx       Auth-aware Supabase adapter and cache invalidation
src/lib/backend.ts         Auth/database/storage operations
src/lib/supabase.ts        Public-key client, session persistence/lifecycle
src/features/             Polls, calendar, recaps, themes, providers and live rooms
supabase/migrations/       PostgreSQL schema, indexes, RLS, secure RPCs, notifications
supabase/functions/         Server-only account-deletion cleanup
supabase/tests/            Actual migration/RLS tests in embedded PostgreSQL
```

Database authorization is independent of UI visibility. Membership grants are made through checked RPCs, invitations are hashed and single-use, media buckets are private, and anonymous users cannot query application data. Discoverability exposes metadata only. Removed members cannot make new content reads/writes or create new media URLs. Already downloaded content cannot be recalled; a previously issued signed URL remains valid until its expiry. The app requests 60-second URLs, but Storage's general signing API can issue other lifetimes to authorized readers. This is not an end-to-end encrypted messenger.

Photo uploads are decoded/re-encoded to strip original EXIF/GPS. Videos are client-limited to ten minutes and 250 MB; server video transcoding, duration enforcement, and metadata stripping need a later media-processing service. A storage provider may enforce a lower cap: Supabase Free can limit individual files to 50 MB even after the bucket migration. The app reports that restriction instead of silently failing or claiming unlimited uploads. See the backend guide for storage configuration, cleanup, and release limitations.

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

Playwright starts/reuses the web development server on port 8081. Tests use fresh browser storage. They exercise publishing/reactions/replies and reload persistence, Circle creation/chat/join requests, profile editing/logout/adult signup, phone navigation, full-size portrait photos, real short-video playback/length validation, polls, event RSVPs, scoped themes, and Highlights montage/read markers. Unit tests check local membership/role boundaries and persistence. Privacy tests apply the exact migration in PGlite with non-superuser auth roles and minimal Supabase auth/storage stubs.

**Validation limits:** embedded SQL tests verify database policies, not the hosted Auth/Storage/WebSocket services. A real configured Supabase project and two devices/sessions are still needed to verify email delivery, actual uploads/downloads, Realtime, removal during an active connection, and deployed account deletion. Real AI calls and LiveKit participant delivery/removal have not been tested with hosted credentials. Calls are disabled until server revocation delivery is explicitly configured; provider outages still create an asynchronous removal window. Web, iOS, and Android bundles were exported in this cloud machine; iOS/Android installation and device behavior require their respective device/simulator toolchains.

Web exports contain a `noindex` robots directive. Configure your web host to serve `dist/index.html` for unknown app routes (SPA fallback), use HTTPS, and add an `X-Robots-Tag: noindex, nofollow` response header for defense in depth. No Supabase service-role secrets belong in a web build.
