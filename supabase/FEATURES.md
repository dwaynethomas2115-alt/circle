# Community features: backend configuration

Apply `migrations/202610290001_circle_features.sql` after the original Circle migration. With the Supabase CLI linked to your project, `supabase db push` applies pending migrations. This is an additive, one-time migration; do not rerun it directly on the same database.

## Polls, calendar, and catch-up

These features need only the existing Supabase project URL and public anon/publishable key. The migration creates private polls/options/votes, events/RSVPs, member-owned read cutoffs, Circle themes, and server-only theme request and call-revocation records.

All content is membership scoped. Discovering a Circle does not expose its events, poll questions/options/results, RSVP roster, or theme. Anonymous users have no access. Removed members lose reads/writes, including to their own prior polls/events, and their read marker is deleted. Poll votes and RSVPs already cast are retained as community records; removed users cannot change them. Blocking hides polls/events and participation from the blocked author/account in the current viewer’s authorized results.

Poll creation and voting use RPCs, not direct client table writes. Options must be 2–6 distinct labels of 1–100 characters; questions are 3–240 characters. A voter has one choice and may change it while the poll is open. A row lock serializes voting with closing/deleting; closed or expired polls reject votes. Only the author or a current owner/admin can close/delete. A foreign poll’s option cannot be voted into another poll.

Members can create future events (title 3–120, description up to 2,000, location up to 200 characters, end after start) and maintain one RSVP per event. Only the author or a current owner/admin can delete an event. RSVP changes are disallowed after the event ends.

Catch-up stores only a timestamp for the current member in a Circle. The caller cannot set another user’s state, move their own marker backward, or send a future cutoff. Capture the cutoff when opening catch-up, so marking the reviewed activity does not consume newer activity that arrived while reading. No AI service is involved in catch-up.

New poll/event notifications use generic activity titles and the Circle ID; they contain no copy of the question, location, or event description. Supabase Realtime publication includes feature tables; authorized clients must still refetch through RLS and revalidate membership on focus and periodically. Actual hosted event delivery requires a two-account integration check.

## Preset and AI themes

Preset themes require no external service. Themes are small allowlisted data objects, not CSS, HTML, image URLs, or scripts. Only current owners/admins can save a Circle theme. Text and layout stay usable: six-digit hex colors; light backgrounds/surfaces; ink contrast at least 4.5 against both; white button text contrast at least 4.5 against accent; motif limited to `garden`, `unicorn`, `vegas`, `coast`, or `minimal`.

For a beginner-friendly dashboard walkthrough, see [Connect OpenAI to Circle themes](../docs/OPENAI_SETUP.md). Decorations currently mean a color palette and a small motif, not generated wallpaper or a 3D room.

For real AI generation:

1. Set `OPENAI_API_KEY` securely in **Supabase Edge Function secrets**, not `.env`, Expo public variables, chat, Git, or the cloud app client. Optional `OPENAI_THEME_MODEL` defaults to `gpt-4.1-mini` and must support structured JSON output.
2. Deploy `supabase functions deploy generate-circle-theme --use-api`, or use the dashboard editor with the existing handler. Supabase injects its project URL and server-only service role key into the Edge runtime. Keep JWT verification enabled: this endpoint is called by a signed-in user session, not a publishable key alone. The handler also verifies the bearer session with Auth on every request. Current Supabase gateway documentation supports legacy and asymmetric user JWTs; new public API key formats do not require disabling this check.
3. Allow outbound HTTPS to `api.openai.com` in your Edge hosting network if restricted. If running integration requests from this cloud machine, allow the exact configured Supabase project hostname in cloud network settings too. Browser/mobile connections use their own network environment.
4. As a Circle owner/admin, type a generic visual prompt and generate a proposal. Generation does **not** change the Circle theme. Preview it and explicitly save it. Other members cannot incur OpenAI calls through this endpoint.

Only the explicit theme prompt is sent to OpenAI, alongside fixed design instructions. The handler does not fetch or send private posts, photos, chats, member names, Circle descriptions, or event data. Avoid personal or sensitive information in a visual prompt. In local demo mode, themes use local preset previews; no AI provider calls occur and previews are not labeled as real AI output.

Database-backed quotas apply before any chargeable provider request: at most 5 generations per user per Circle per hour, 20 per user per day, and 12 per Circle per hour. Reservations count even if the provider fails, preventing unbounded retries. Advisory transaction locks make quota checks atomic across concurrent calls. Invalid palettes, unsupported motifs, poor contrast, provider failures, and permissions revoked during generation fail without changing the saved theme.

AI proposals are recorded by a service-only RPC after schema/color validation. Saving a theme with `source: 'ai'` requires an exact matching server-issued proposal for that manager and Circle within the last day (or the exact already-saved theme); changing client labels alone cannot manufacture AI provenance. The client never receives the OpenAI or Supabase service role key.

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

`tests/features.mjs` applies **both exact migrations** in embedded PostgreSQL with minimal Auth/Storage fixtures and then uses non-superuser roles. It verifies private reads/writes, removed-member behavior, voting/expiry/role constraints, cross-poll integrity, RSVP bounds, catch-up isolation, theme palette/provenance/quota rules, and service-only call-revocation outbox access.

`tests/theme-edge.mjs` executes the actual Edge handler with mocked upstream HTTP. It checks authentication, role/quota denial before provider usage, explicit-prompt-only requests, palette rejection, service-only proposal recording, and failures without fake success. These tests do not call OpenAI or a hosted Supabase project.

Production credentials are not present in this development environment. Hosted Auth, Realtime, OpenAI output, Storage, deployed Edge configuration, and LiveKit calls/revocation must be tested with configured services. Passing embedded/mocked tests is not a production deployment claim.
