# Circle voice and video rooms

Each Circle has one drop-in room. Approved members can join with their camera and microphone off, turn either on, hear actual remote audio, and leave. The web client uses `livekit-client`; no sample member appears as a live participant. The local demo offers a **self-only camera/microphone preview**, not a call or multi-user presence.

Live calls are implemented for the **web app** over HTTPS. Expo Go/native builds display browser join instructions; when `EXPO_PUBLIC_WEB_APP_URL` is set to your deployed HTTPS Circle web app, they can open the matching Circle room there. Browser sign-in is required. Native WebRTC requires LiveKit's React Native SDK and a custom Expo development build, which this version does not ship.

## Configure the services

First configure Supabase using [README.md](README.md), apply both migrations, and create at least two adult accounts approved in the same Circle. Keep Supabase service-role and LiveKit API secrets exclusively on the server.

1. Create a LiveKit Cloud project (or a compatible, operated LiveKit server). Record the `wss://` project URL and server API key/secret. Do not use the key/secret as public Expo variables.
2. Put these values in a **local ignored** `.env.rooms.local` file with permissions restricted to its owner, and upload it using `supabase secrets set --env-file .env.rooms.local`:

   ```dotenv
   LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
   LIVEKIT_API_KEY=YOUR_SERVER_API_KEY
   LIVEKIT_API_SECRET=YOUR_SERVER_API_SECRET
   CIRCLE_ROOM_HOOK_SECRET=YOUR_GENERATED_RANDOM_32_BYTE_OR_LONGER_SECRET
   LIVEKIT_REVOCATION_ENABLED=false
   ```

   Generate the hook secret locally; enter it through your secret manager or secure environment settings, never chat. Supabase supplies the function's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server bindings. The `.local` file is ignored by Git; keep it out of frontend builds.

3. Deploy `supabase functions deploy circle-room --no-verify-jwt`. The gateway must allow the LiveKit signature and database worker header. **The handler still verifies every normal caller through Supabase Auth**, validates worker authorization, and verifies LiveKit webhook signatures; bypassing gateway verification does not make the room public.
4. In LiveKit's project webhook settings, add `https://YOUR-PROJECT.supabase.co/functions/v1/circle-room?action=livekit-webhook`, signed with the same server API key used above. It checks current membership on `participant_joined` and disconnects anyone who was removed between token issuance and connection. Use the provider's webhook delivery monitoring/retries.
5. In **Supabase Vault**, create two named secrets using the dashboard secure value editor:

   | Vault name                 | Value                                                       |
   | -------------------------- | ----------------------------------------------------------- |
   | `circle_room_function_url` | `https://YOUR-PROJECT.supabase.co/functions/v1/circle-room` |
   | `circle_room_hook_secret`  | The same random value as server `CIRCLE_ROOM_HOOK_SECRET`   |

   Run [room-delivery.sql](room-delivery.sql) as the project database administrator. It installs a database queue notification and a `pg_cron` minute retry worker using `pg_net`. Required extensions are `pg_net`, `pg_cron`, and Supabase Vault. This optional infrastructure script is separate from the portable app migrations. It does not contain secret values.

6. Check that the `circle-room-revocations` cron job is active, the outbox delivery trigger exists, and both webhook routes receive verified requests. Set server `LIVEKIT_REVOCATION_ENABLED=true` **only after wiring both delivery paths**. With this flag absent/false, the function fails closed and issues no tokens.
7. Allow the exact Supabase project hostname and your LiveKit signaling/media destinations in the relevant deployment network policy. WebRTC media also needs LiveKit's documented ICE/STUN/TURN UDP/TCP connectivity; a cloud HTTP allowlist alone does not establish browser calling support. Grant browser camera/microphone permission when explicitly turning them on. No public LiveKit client key is required: the client receives only a short-lived, scoped token from the authenticated Edge endpoint.

For native browser launch, optionally set `EXPO_PUBLIC_WEB_APP_URL=https://YOUR-DEPLOYED-CIRCLE-WEB-APP` before the native build. It is a public application address, never a secret.

## Authorization and revocation

The Edge function trusts neither a caller-supplied user identity nor arbitrary room names. It verifies the access token with Supabase Auth, checks membership using a server-only database request, and issues a 60-second initial-connection grant for exactly `circle:<circle UUID>` and the verified user's identity. Names come from the caller's profile. The grant has no administrative or data-publication permissions. The backend rechecks membership after administrative requests and before minting a grant.

Removing a member (including deleting an account or Circle) queues a durable event. Server-only pending/acknowledgment RPCs expose that queue to the Edge worker. The worker removes the exact persisted participant from LiveKit and acknowledges only after successful eviction (already absent is idempotently successful). Failed events remain for retry. An untrusted webhook body cannot nominate another user for removal. Join/status requests also drain the queue and sweep the requested room for revoked participants. The client checks authorization every 10 seconds and disconnects on failure, unmount, sign-out or confirmed membership loss. Backend worker and provider webhook enforcement do not depend on that cooperative client behavior.

**Revocation is asynchronous.** The database commit, worker/provider calls and webhook delivery have latency; the fallback worker runs once a minute, and provider/network failures may extend that window. A token's 60-second expiry limits initial token use, **not the duration of an already established call**. The installed LiveKit server SDK documents that a removed participant can rejoin with a valid token; the signed participant-joined hook evicts unauthorized reconnects, and any additional LiveKit Cloud token-revocation behavior must be confirmed for the deployed project. Do not claim instantaneous revocation or treat a token TTL as session termination. Monitor queue age and delivery failures, disable new grants during delivery outages, and verify the reconnect case before launch. `LIVEKIT_REVOCATION_ENABLED` is an operator attestation, not automatic proof of healthy webhooks.

Calls use LiveKit's encrypted transport. This version does not configure end-to-end media encryption or recording. LiveKit is a trusted media processor; do not describe transport encryption as end-to-end encryption.

## Test and verify

Run `node --test supabase/tests/room-handler.mjs` (also included by `npm run test:privacy`). It executes the real handler with stubbed external Auth/LiveKit transports, covering authentication, membership, removed users, scoped grants, provider signature verification, revocation retries and fail-closed errors. Database tests cover queue creation and service-only access. These are not a hosted WebRTC integration test.

Before enabling real users, run this checklist against the configured services:

1. Sign in as two approved accounts in different browser profiles, open the same Circle room, and join. Both must see the actual other participant. Verify microphone audio, camera video, mute, camera-off, leave/rejoin, and browser autoplay permission recovery. A different Circle must use a separate room.
2. A signed-out user, discoverable-Circle nonmember and pending requester must all receive 401/403 from `circle-room` and receive no room token. Supplying another user's ID must not change the verified token identity.
3. Have the owner remove an actively connected member. Verify backend participant eviction, outbox acknowledgment and denied new tokens. Attempt reconnect with the previously issued token and verify the signed join webhook evicts it. Check the actual delay; do not report instant revocation.
4. Temporarily interrupt immediate delivery, remove a member, then restore delivery. Verify the scheduled worker retries the unacknowledged event. Interrupt LiveKit access and verify no new grants are reported as successful while eviction fails.
5. Delete an account/Circle, verify all its queued active participants are removed, then check there are no old memberships or reusable grants through the broker.
6. In local demo, enable camera/microphone preview then stop, navigate away and close the room. Device capture must stop; the demo must never display other sample users as live callers.

Current cloud setup has no Supabase/LiveKit credentials. Handler/database tests can run locally; hosted calls, webhook delivery, media permissions on physical phones and native calling are **unverified** until the checklist is completed.
