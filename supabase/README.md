# Supabase backend

The app runs a labeled, single-device local demo when neither Supabase environment variable is configured. Demo data stays in the local AsyncStorage namespace. It provides no server privacy or multi-user communication.

## Configure a real project

1. Create a Supabase project. Keep email confirmation enabled in Authentication → Providers → Email. Configure the site's URL and allowed auth redirect URLs for your web deployment or Expo deep-link environment. Adult-managed accounts only; there are no child accounts.
2. On a **fresh** project, apply all files in `supabase/migrations/` in filename order using the SQL editor, or use the Supabase CLI (`supabase link --project-ref <ref>` and `supabase db push`). Existing projects should apply only pending files. The migrations create tables, indexes, RLS, permission-limited RPCs, notifications, private buckets, Realtime publication, wallpapers, and larger-media support. Each file is a one-time migration, not an idempotent seed script.
3. Allow your project’s exact HTTPS hostname in cloud environment network settings if running integration checks from this managed cloud machine (for example, `<project-ref>.supabase.co`). Copy `.env.example` to `.env`. Fill `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` with the project URL and public anon/publishable key. Never use the service role key in the app. Restart Expo after changing public variables.
4. Deploy the authenticated account-deletion Edge Function with `supabase functions deploy delete-account`. The runtime supplies server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; never copy these secrets into the app. The function validates the caller with Auth, removes only their uploads through the Storage API, then calls the caller-authorized SQL deletion RPC.
5. Sign up two real adult test accounts, confirm email, create a Circle, then request and approve membership or share a generated invitation token. No sample users or local demo records are copied into Supabase.
6. In two signed-in browser/device sessions, verify new messages appear, then remove a member and verify they can no longer query the feed, send messages, or obtain new media URLs. Check behavior after app foreground, refresh, and token refresh too. Existing locally downloaded content cannot be recalled.

Signup requires an adult self-attestation, persisted as an immutable profile timestamp by the Auth trigger. This is not identity or age verification. No extra API keys are needed for app authentication, database operations, or media storage. Email delivery, email confirmation redirect behavior, and hosted Realtime must be checked in the configured project. Push notifications are intentionally outside this MVP.

## Security model

- Every application table has RLS. Anonymous accounts have no app-table or RPC access. Discoverability reveals Circle metadata to signed-in users, never posts, chat, members, comments, reactions, or media.
- Membership writes happen only through limited SECURITY DEFINER functions with an empty search path and explicit caller checks. Membership helpers avoid recursive RLS. Ordinary members cannot self-approve, forge authors, or assign roles. An admin cannot appoint another admin or change/remove an owner. Only the owner can transfer ownership or delete a Circle.
- Foreign keys and immutable column grants protect ownership. Triggers reject cross-post threaded replies and cross-Circle reports; media attachment paths must match the post Circle and uploader. Post creation and attachment rows are committed atomically.
- Random 256-bit invitation bearer tokens are stored only as SHA-256 hashes, expire in seven days, and can be redeemed once. Email-bound invitations require the same verified auth email. Tokens are shown once to the manager; the app does not send invitation emails. Removal invalidates all outstanding invitations in that Circle so a removed member cannot reuse an old bearer invitation. A fresh invitation can be created afterward.
- Removed members lose database and new media URL access through current-membership checks. The client clears/refetches authorized data on membership changes and foreground. Supabase Postgres Changes uses SELECT RLS; Realtime is not a replacement for authorization on each operation. Avoid public broadcast channels. Already downloaded information, screenshots, and media cannot be recalled.
- `circle-media` is private and path scoped as `<circle-uuid>/<uploader-uuid>/<random-name>`. Members may upload only under their own prefix. Reading requires current membership, an existing author, no block, and a live post/avatar/cover reference. Deleted-post orphan objects are inaccessible. Photos accept up to 200 MB of input and are re-encoded as JPEG at quality 0.95, up to 4096 pixels on the longest edge without enlarging smaller photos, removing source EXIF/GPS metadata. This does not preserve the original file; device memory and image-format support still constrain decoding. Videos support up to 10 minutes/250 MB in the client; **video metadata stripping/server duration validation is not implemented**. Strip sensitive metadata before sharing videos. A server processing pipeline is needed for stronger video guarantees.
- Profile avatars use the separate private `profile-avatars` bucket. They are intentionally visible to signed-in accounts as part of profile identity; anonymous access is denied. Originals are re-encoded, and blocks limit access. Circle names/descriptions marked discoverable and signed-in profile names/usernames/bios are not confidential content.
- App-generated signed URLs live for at most 60 seconds. This is a client convention; Supabase's storage signing endpoint supports other lifetimes for an authorized reader. Previously issued URLs can survive removal until expiry. A strict server-enforced expiry policy would need a custom media delivery service. Legitimate members can always save content they can view.
- Account deletion deletes owned Circles and their content, then the auth account and dependent profile/content rows. Transfer Circle ownership first to preserve a community. The authenticated delete-account Edge Function removes the caller’s uploaded objects with the server-side Storage API before SQL deletion (hosted Auth may otherwise reject users who own objects). Cleanup failure stops deletion and is reported. Deleting a Circle also removes other members’ content references; their physical orphan objects become inaccessible and can be removed with a privileged scheduled cleanup job. Media cleanup and SQL account deletion are not a single transaction; retry after a failure. No service-role key belongs in the client.
- Reports are member-created and visible to the reporter and Circle moderators. Blocking hides posts/chat/reactions/comments between the two accounts and denies their Circle media reads. Notifications contain generic activity text, not copies of private message/post bodies.

## Larger photos and videos

Apply `supabase/migrations/202610300002_large_media.sql` once after the base migration. It raises the private `circle-media` bucket ceiling to 250 MB while preserving its access policies. In the Supabase dashboard, also check **Storage → Settings → maximum upload size**: the project-wide limit and the provider's plan ceiling still apply. A bucket migration cannot increase a plan allowance. Supabase Free projects can be capped at 50 MB per file; if that applies to your project, a larger video needs compression, a plan that permits larger files, or another storage provider. Circle reports this restriction instead of calling the upload successful.

Uploads use authenticated TUS requests to the same configured Supabase host in 6 MiB chunks. The app refreshes its session headers between chunks and uses the server's offset after an interrupted response, avoiding duplicate bytes. A retry remains within the current upload attempt; closing/reloading the app requires starting again. Progress and cancellation appear while sharing. Browser uploads read Blob slices; native uploads read disk slices, with Android `content:` files first copied to cache. The app does not load an entire 250 MB video into a JavaScript ArrayBuffer. Keep the app open during upload; background uploading is not implemented. Canceled incomplete TUS uploads expire on the storage service's schedule.

The local demo saves attachments in IndexedDB (web) or app document storage (native); its available disk/browser quota can be smaller than Circle's attachment limits. An unsuccessful save keeps the draft and rolls back uncommitted local files. Hosted Storage, real slow/interrupted networks, native disk slicing, and provider plan enforcement still need checks in your configured project/device; automated upload tests use a simulated TUS service.

## Tests

From the repository root:

```sh
npm run test:privacy
# The Edge handler tests can also run individually:
node supabase/tests/account-deletion.mjs
```

`supabase/tests/privacy.mjs` applies the **exact SQL migration** in embedded PostgreSQL through PGlite, then switches to `anon` and `authenticated` non-superuser roles. It exercises RLS and RPC denial for outsiders and removed members, role escalation, invitations, immutable ownership, cross-Circle references, blocks, media row policies, notification isolation, account deletion, and ownership transfer.

The test harness supplies minimal `auth.users`, `auth.uid()`, `storage.objects`, `storage.buckets`, and a Realtime publication. This validates SQL and RLS semantics; it does **not** validate hosted Auth delivery, actual object signing/downloading, mobile uploads, or WebSocket event delivery. Run the two-account hosted checks above before production use. There are no claimed hosted integration passes without configured credentials.

The Edge handler tests execute the actual Deno handler code under Node with mocked upstream HTTP to verify caller authentication, caller-only media deletion, cleanup ordering, and failures. Node 22.13+ is required for its built-in TypeScript stripping; Node 24 is used in this environment. These tests do not contact a hosted project.

## Community features and live rooms

Apply the additive feature migration after the base migration. See [polls, events, catch-up, and AI themes](FEATURES.md) and [LiveKit room setup](ROOMS.md) for server configuration, deployment order, authorization boundaries, and hosted verification requirements. Preset themes and database features work without an AI or calling provider. Real AI themes and live rooms require the documented server-only provider credentials.
