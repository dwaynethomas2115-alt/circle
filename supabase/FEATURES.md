# Community features: backend configuration

Apply `migrations/202610290001_circle_features.sql` after the original Circle migration. With the Supabase CLI linked to your project, `supabase db push` applies pending migrations. This is an additive, one-time migration; do not rerun it directly on the same database.

## Polls, calendar, and catch-up

These features need only the existing Supabase project URL and public anon/publishable key. The migration creates private polls/options/votes, events/RSVPs, member-owned read cutoffs, Circle themes, and server-only theme request and call-revocation records.

All content is membership scoped. Discovering a Circle does not expose its events, poll questions/options/results, RSVP roster, or theme. Anonymous users have no access. Removed members lose reads/writes, including to their own prior polls/events, and their read marker is deleted. Poll votes and RSVPs already cast are retained as community records; removed users cannot change them. Blocking hides polls/events and participation from the blocked author/account in the current viewer’s authorized results.

Poll creation and voting use RPCs, not direct client table writes. Options must be 2–6 distinct labels of 1–100 characters; questions are 3–240 characters. A voter has one choice and may change it while the poll is open. A row lock serializes voting with closing/deleting; closed or expired polls reject votes. Only the author or a current owner/admin can close/delete. A foreign poll’s option cannot be voted into another poll.

Members can create future events (title 3–120, description up to 2,000, location up to 200 characters, end after start) and maintain one RSVP per event. Only the author or a current owner/admin can delete an event. RSVP changes are disallowed after the event ends.

Catch-up stores only a timestamp for the current member in a Circle. The caller cannot set another user’s state, move their own marker backward, or send a future cutoff. Capture the cutoff when opening catch-up, so marking the reviewed activity does not consume newer activity that arrived while reading. No AI service is involved in catch-up.

New poll/event notifications use generic activity titles and the Circle ID; they contain no copy of the question, location, or event description. Supabase Realtime publication includes feature tables; authorized clients must still refetch through RLS and revalidate membership on focus and periodically. Actual hosted event delivery requires a two-account integration check.

## AI wallpaper themes

Apply the additive [wallpaper migration](migrations/202610300001_circle_wallpapers.sql) after the two existing migrations, then redeploy `generate-circle-theme`. Existing saved palettes continue to work. The updated function requires the new service-only reservation function; deploying only the client or only the function is incomplete. Dashboard SQL users should run only pending migrations once.

Circle now generates a full **1536 × 1024 illustrated wallpaper** using the OpenAI Images API, alongside an accessible UI palette. The image prompt asks the model to combine **all** requested interests in a cohesive, colorful scene, so a description involving pink fashion dolls, tornadoes, and volcanoes does not simply select a pink preset. AI output can vary; review the preview before applying it. The editor accepts a visual description of 3–1,000 characters. Only current Circle owners/admins can generate or apply themes.

For the dashboard walkthrough, see [Connect OpenAI to Circle themes](../docs/OPENAI_SETUP.md). Configure these **server-only Edge Function secrets**:

| Secret                       | Default        | Purpose                                                                                                        |
| ---------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`             | Required       | OpenAI API project key with billing and image-model access. API usage is separate from a ChatGPT subscription. |
| `OPENAI_THEME_MODEL`         | `gpt-4.1-mini` | Structured palette generation.                                                                                 |
| `OPENAI_THEME_IMAGE_MODEL`   | `gpt-image-1`  | Images API model supporting WebP output and landscape size.                                                    |
| `OPENAI_THEME_IMAGE_QUALITY` | `medium`       | `low`, `medium`, or `high`; affects image cost and generation time.                                            |
| `THEME_DAILY_LIMIT`          | `50`           | Successful wallpapers per user across Circles in a rolling 24-hour window; integer 1–200.                      |
| `THEME_BURST_LIMIT`          | `3`            | Attempts per user per minute; integer 1–10.                                                                    |

Never put these secrets in Expo public variables, browser JavaScript, chat, or Git. Supabase injects the project URL and service-role credential into the Edge runtime. Keep JWT verification enabled, and deploy with `supabase functions deploy generate-circle-theme --use-api`. The handler independently verifies the session and current owner/admin role. Allow outbound HTTPS to `api.openai.com` where the Edge network is restricted.

Only the manager’s explicit visual prompt and fixed design instructions are sent to OpenAI. The function does not fetch or send private posts, photos, chats, profiles, events, or Circle descriptions. Avoid personal or sensitive details in the prompt. Local demo mode does not call OpenAI and must not claim its preset preview is AI artwork.

### Private wallpaper storage

Generated WebP images are stored in the private `circle-wallpapers` bucket under `<circle UUID>/<generation-request UUID>.webp`. Images are limited to 10 MB, base64 payloads and WebP headers are validated, and only the Edge server can write/delete this bucket. Theme JSON contains an allowlisted `wallpaperPath`, never a third-party URL, CSS, HTML, or scripts. UI colors retain six-digit hex validation, pale card surfaces, and WCAG contrast checks.

Current members may read the currently applied wallpaper. Before it is applied, only the manager who requested a valid preview can read it. Another admin, a discoverable-Circle visitor, and a removed member cannot read that private preview. Clients sign authorized image paths with short-lived URLs and refresh through membership checks; a URL already issued can remain usable until expiry, and authorized members can save images they can view.

The service-only completion RPC rechecks manager membership and requires the exact image path for its own request, an existing stored object, and validated theme data. Applying `source: 'ai'` requires that exact server-issued proposal for this manager/Circle from the last day, or the already-saved theme. A client cannot invent an AI source label, cross-Circle wallpaper path, or arbitrary external image URL.

### Limits and failures

Successful wallpapers count toward the rolling daily allowance. Failed palette, image, storage, or permission checks release the pending reservation and do not consume that allowance. A one-active-generation-per-user hold prevents concurrent chargeable calls; abandoned holds expire after ten minutes. Attempts still count toward the brief per-minute guard, preventing unlimited immediate retries against a failing provider. Advisory transaction locks make the checks atomic. Only the service role can call the reservation RPC or supply server-configured limits.

Burst, daily, and already-running responses carry distinct `code`, `retryAfterSeconds`, `resetAt` where applicable, and an HTTP `Retry-After` header. A daily-limit response explains the rolling 24-hour window rather than asking the user to wait one minute. OpenAI capacity, OpenAI billing/model access, and backend storage failures have separate messages and codes. No unsuccessful generation changes the saved Circle theme.

Completion is idempotent: a retry of the exact stored proposal acknowledges the same request without creating another generation or daily charge. If a completion response is lost or a gateway returns an ambiguous failure, the handler confirms the exact server-side result and retries completion once. If status remains unknown, it keeps the private image and reservation rather than deleting a possibly committed wallpaper or promising an allowance refund.

On a definitely rejected failure after upload, the function attempts to delete the unused object through the Storage API and releases the hold; if cleanup is temporarily unavailable the object remains private. Retention cleanup for old unused previews, replaced wallpapers, and Circle/account deletion should remove unreferenced objects through the **Storage API**, never by deleting `storage.objects` rows directly. This repository does not schedule that retention worker automatically. Keep successful request records for at least 24 hours so cleanup cannot reset usage accounting. Image generation, media storage/traffic, and server execution can incur their providers’ charges.

## Live call revocation support

The feature migration adds a durable `circle_call_revocations` outbox. Every deleted Circle membership, including membership deletion during Circle/account deletion, enqueues a provider removal record. There are no Circle/profile foreign keys on this outbox, so required cleanup survives deletion of those records. Clients cannot read, insert, acknowledge, or pick arbitrary provider-removal targets. Only service-role RPCs can read the oldest 100 pending records and acknowledge successful delivery.

Follow the separate Circle-room delivery setup documentation and optional `supabase/room-delivery.sql` before enabling real calls. The provider Edge Function must authenticate its hook secret, drain actual queued records itself, and acknowledge only after removal succeeds. Configure durable retry delivery as documented there. Network failures create a residual revocation window; a database commit cannot synchronously recall WebRTC media over an unavailable provider API. No hosted provider revocation guarantee is claimed by these database tests.

## Validation

From the repository root:

```sh
npm run test:privacy
npm run typecheck
npm run lint
```

`tests/features.mjs` applies the original and community-feature migrations in embedded PostgreSQL with minimal Auth/Storage fixtures and then uses non-superuser roles. It verifies private reads/writes, removed-member behavior, voting/expiry/role constraints, cross-poll integrity, RSVP bounds, catch-up isolation, theme palette/provenance/quota rules, and service-only call-revocation outbox access.

`tests/theme-edge.mjs` executes the actual Edge handler with mocked Auth/DB/Storage/OpenAI HTTP. It checks authentication, role/quota denial before provider usage, explicit-prompt-only palette/image requests, real-image storage contracts, palette/image rejection, separate billing/storage/rate messages, and failed-request cleanup. `tests/wallpapers.mjs` applies the exact three migrations in embedded PostgreSQL and checks private image paths, preview/active membership access, service-only quotas, rolling daily limits, failed-reservation release, abandoned holds, and provenance. These tests do not call OpenAI or a hosted Supabase project.

Production credentials are not present in this development environment. Hosted Auth, Realtime, OpenAI output, Storage, deployed Edge configuration, and LiveKit calls/revocation must be tested with configured services. Passing embedded/mocked tests is not a production deployment claim.
