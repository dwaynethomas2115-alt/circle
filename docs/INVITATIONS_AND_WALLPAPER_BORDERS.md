# Circle invitations and scattered wallpaper borders

Prepared for Dwayne's request to make the working sparse wallpaper less uniform, keep its illustrations visible at the sides, and add invitations to both the Circle app and a specific private Circle.

## What changes

### Wallpaper

Future image requests keep the solid background and small illustrations, but ask for irregular positions, varied gaps, gently varied sizes, and independent tilts of about -25 to +25 degrees. The image prompt explicitly rejects grids, matching columns, straight rows, and mirrored pairs. It reserves the central 68% for the journal cards and concentrates illustrations in the outer 16% on each side, mostly near the outside edges. Phone layouts leave a little more space beside the cards.

These are instructions to the image model, not a programmatic guarantee about generated pixels. Existing artwork is not regenerated or overwritten. Actual future appearance requires a new generation after the matching backend deployment; no paid generation is authorized as a release test.

### Invite to Circle

Open **My Circles** or **My profile**, then **Invite people → Share app link** or **Copy app link**. This shares the app's `/welcome` page, with no private Circle name, code, membership grant, or invitation-creation call.

### Invite to a specific Circle

Open that Circle and choose **Invite people → Create private invitation**. Owners and admins can create a private link, then deliberately share or copy it. Members retain the general app-sharing option but cannot create a private Circle invitation. **Invite another person** resets the local form; another token is created only after pressing **Create private invitation** again. Existing links remain valid until used or expired.

Each private invitation retains the existing seven-day expiry and single-use behavior. The recipient opens `/join#invite=CODE`, signs in or creates an account, reviews the invitation, then explicitly presses **Join the Circle**. Nothing is joined automatically. Existing code-only invitations still work, and a recipient can paste a valid app invitation link into the code field.

Private codes stay in the URL fragment during authentication, outside HTTP request URLs/referrers, without extra local/session storage. The authentication return is limited to `/join`; arbitrary redirect destinations are rejected. Public invitation pages show generic information, without fetching the Circle's private metadata. Creation/authentication/redemption ignore stale asynchronous results after relevant navigation/account/role changes.

Browser verification caught two Expo Router issues that could lose the code during sign-in or refresh: object-URL encoding altered the fragment, and web startup placed a query after the fragment. Invitation helpers now return validated, complete internal string URLs, and all invitation authentication context stays in the fragment (`/auth#invite=CODE&mode=signin&next=join`). A separate strict parser validates that context, and form-mode changes update only the fragment. Regressions use the installed router's actual `resolveHref` implementation and the observed startup ordering, rather than only checking the helper's object shape. Shared links remain `/join#invite=CODE`.

The browser uses its share chooser or clipboard when available, with selectable-link fallback when access is unavailable. Canceling a share does not silently copy the link. Native builds use React Native's share chooser and manual link selection without a new dependency. This does not install native universal-link associations or publish a mobile app to either store.

## Preserved backend and account behavior

No new invitation table, schema, permission, or account service is needed. Existing authenticated server checks enforce owner/admin creation, hashed production invitation storage, single-use redemption, and expiry. Invitation bearer tokens remain excluded from snapshots. Sharing is initiated by the app user; Codex does not send messages or email invitations during development or verification.

Keep `OPENAI_THEME_IMAGE_MODEL=gpt-image-2.5-sunburst` and `OPENAI_THEME_MODEL=gpt-6-luna`. JPEG, `1536x1024`, medium quality, compression 85, opaque background, private shared `circle-media`, signed URLs, credentials, and existing security/billing/storage settings remain unchanged. There is no extra provider request or automatic paid retry.

## Verification and release

Local unit and backend suites passed (95 client tests and 81 backend tests), with type checking, lint, and the Appwrite bundle build also passing. Twenty-one fully intercepted browser scenarios passed at widths 1440, 390, and 360, covering sharing, cancellation/manual fallback, owner/member limits, signup/sign-in, mode changes, back navigation, refresh, explicit redemption, invalid/used invitations, and unsafe redirect rejection. The email-confirmation branch was simulated UI coverage, not an inspection of email configuration or delivery.

A final presentation change puts private invitations first when a manager opens the sheet inside a Circle. All nine sharing scenarios were rerun successfully at the same three widths after that change, including checks for section/focus order and phone header controls. General app-sharing remains first in Profile/My Circles.

Browser fixtures use dummy accounts, sample media, and a handmade edge-pattern JPEG. They do not establish real hosted signup/invitation delivery, native-device share behavior, or the appearance of a generated wallpaper. No live provider call, real account creation, personal upload, or actual message send is performed.

Publishing the reviewed source to the existing GitHub repository can trigger its Vercel integration. Verify the exact deployed website commit separately. The website update supplies sharing, join/auth flow, and layout changes; the manual Appwrite update supplies the new future-generation art instructions. Both are needed for the complete update.

Dot should package only these files from the exact published commit, at the archive root:

| Archive file        | Repository path                       | Git blob SHA                               |
| ------------------- | ------------------------------------- | ------------------------------------------ |
| `main.js`           | `appwrite/function/main.js`           | `913532038a777d64f7d959d77ad532d14dd19012` |
| `package.json`      | `appwrite/function/package.json`      | `179070395e599eeae177b52c4dddf5746d7b5b27` |
| `package-lock.json` | `appwrite/function/package-lock.json` | `54785bc26284ff14eb3b23b2161b5ae74fbe3c93` |

Deploy to existing Appwrite project `6ae3ee7000368dcb80e7`, Function `circle-api`. Preserve Node.js 22, entrypoint `main.js`, build command `npm ci --omit=dev`, timeout 180 seconds, user-only execution, existing scopes/schedules/events, model variables, and all other settings. No new variables, credentials, database tables, buckets, or permissions are required. Do not run provisioning, a generation retry, or a paid test. A successful deployment establishes that the new instructions are active, not that a newly generated image was visually verified.
