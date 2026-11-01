# Compact Circle header and simpler entry points

This update is prepared for local review only. Dwayne explicitly requested no
push or deployment until subsequent approval. No production settings or backend
code are part of this change.

## What changed

- Shorter cover and title area. The large cover-photo label is replaced by a
  camera overlay with a 44 × 44 touch target, accessible label, keyboard activation,
  and visible keyboard focus. Owners and admins retain their existing editing
  permissions. The move/zoom crop editor still measures the displayed cover frame.
- Memories, Chat, and Highlights are the three primary tabs. Existing feed links
  still work; `tab=memories` also opens Memories. The room icon stays at the top.
- The More (…) control opens invitations, calendar, members, About, reports, and
  settings. Settings and reports retain their existing role restrictions. Pending
  requests have an indicator for managers. Settings → Cover photo remains an
  alternative way to edit the cover.
- The Circle journal has one Add memory entry. The composer starts with text and
  optional Photo/Video attachments; existing album ordering and uploads are
  preserved. Home and navigation use the same Add memory wording.
- Welcome offers Get started and a separate Have an invitation? entry. Sign-in
  uses Enter password and includes Forgot password. Password recovery uses the
  existing Appwrite account API with an explicit email request and explicit reset
  confirmation. Tests use dummy reset tokens and passwords only. Temporary reset
  link parameters are removed from the browser address/history after capture;
  provider errors are not displayed. A reset does not automatically sign in.
- Join requests say Pending approval. Membership approved appears only when an
  approved request and current membership both exist. A successful private
  invitation shows a generic Invitation accepted confirmation and Open Circle;
  existing direct-join invitations do not acquire a new approval requirement.
  Private memories and chat remain behind membership checks.

## Scope and verification limits

Signed-in layouts are design changes verified with local sample data and mocked
services, not claims of observed bugs in a signed-in production account. The
mobile My Circles title now gets its own row so its action buttons cannot squeeze
it into a narrow column.

Appwrite database, accounts, function bundle, models, storage, and permissions are
unchanged. No dependencies were added. No live reset email, account creation,
photo upload, room join, invitation redemption, provider call, or paid generation
was performed. Hosted password-reset email delivery and actual device behavior
remain unverified; they rely on the existing Appwrite email/web-platform setup.

This is a frontend-only change. No Appwrite archive or function redeployment is
needed. After future publication approval, a normal GitHub push may trigger
Vercel automatically; no push has been made for this review.

## Checks

- 129 automated client/helper tests passed, including 8 new mocked recovery tests.
- TypeScript, ESLint, targeted formatting, and `git diff --check` passed.
- Web, iOS, and Android JavaScript bundle exports passed. These are build checks,
  not native device or store-release tests.
- 60 mocked browser scenarios passed: 21 header/crop/navigation cases, 21
  invitation/request cases, 16 public-entry/recovery cases, and 2 additional
  single-photo/album publication cases. Header and invitation checks cover
  1440px, 390px, and 360px widths; public recovery checks cover 1440px and 390px.
- Camera Enter/Space activation, visible focus, menu focus containment,
  Escape/backdrop closing, owner/admin/member roles, cover movement/zoom and JPEG
  crop dimensions, text memories, album ordering, and private mock uploads were
  checked. Chat remains mounted while Room/Calendar is shown so child drafts
  retain their existing lifecycle.

Browser fixtures intercept or block all external requests and use sample images
and dummy accounts. Real credentials are never needed for these checks. Recovery
context checks covered a pending reset-email request, not a completed sign-in
overlapping reset navigation. No claim is made about that additional overlap or
native email deep links.

Local artifacts (outside the repository):

- `/tmp/circle-header-smoke/header-390.png` and `header-1440.png`
- `/tmp/circle-header-smoke/options-390.png`
- `/tmp/circle-header-smoke/report.json` and `invitation-report.json`
- `/tmp/circle-memory-publish-smoke/report.json`
- `/tmp/circle-entry-smoke/report.json`
