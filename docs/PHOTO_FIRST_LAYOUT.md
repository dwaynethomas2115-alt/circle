# Photo-first Circle layout

Dwayne chose option 1 from the five layout previews: remove the banner and put a
small Circle picture beside the name, with memories immediately below the tabs.
This is a frontend change prepared locally for review. Publication and deployment
have not been performed for this change.

## What changed

- A centered, compact Circle header replaces the large cover and identity panel.
  Its 44px photo sits beside the name, private status, room icon, and More menu.
- Memories, Chat, and Highlights stay prominent. The separate composer, Circle
  journal heading, descriptive subtitles, month chips, and duplicate month
  headings are removed from the default feed.
- A 44px filter button opens month and ordering choices. An active-filter summary
  appears only when needed, with a clear action. This still filters the moments
  currently loaded; it does not introduce server pagination or a complete archive
  search.
- Desktop keeps an Add memory button in the header. Phone uses the existing bottom
  navigation plus button. Both select the current Circle before opening the
  composer. The desktop sidebar action also retains that Circle context.
- Owners and admins tap the small picture to choose, move, and zoom a replacement
  in a square crop frame. Settings calls it Circle photo and shows a small preview.
  New Circle creation offers one optional small picture instead of two uploads.
- The existing `circle.cover` field and private upload action are reused. Existing
  photos are displayed with a circular center crop; no existing files are
  rewritten or deleted by installing this change. Other Circle browsing cards
  retain their existing presentation.

## Access and media behavior

The thumbnail uses `StableImage` with the explicit Circle scope, preserving the
previous performance work. Owner/admin checks, independent editor authorization,
account/Circle/role fences, private projection checks, token lifetimes, and media
storage remain unchanged. Losing membership closes filters and editing; losing
the manager role closes editing. Chat remains mounted behind secondary surfaces
to preserve its draft lifecycle.

No backend, model, credentials, permissions, storage settings, database schema,
dependencies, or production configuration changed. No persistent private-media
cache was introduced. Already-rendered pixels are distinct from a reusable
expired URL; fresh viewer requests still require current authorized access.

## Local verification

- 143 client/helper tests passed, including existing image, access-scope, and crop
  tests. TypeScript, ESLint, formatting, and diff checks passed.
- Web, iOS, and Android exports passed. These are bundling checks, not tests on a
  physical iPhone or Android device.
- 15 focused mocked-browser scenarios passed: four responsive layouts, date and
  order filters/reset/clear, Enter/Space photo editing and square crop movement
  with cancel, core navigation, Circle-scoped Add memory on phone and desktop,
  ordinary-member controls, revocation with filters/editor open, role reduction,
  the single-photo creation form, and an empty Circle/photo fallback.
- 16 additional mocked media/performance scenarios passed: expiry and manual
  retry, file replacement and deletion, role changes, account changes, late
  account/Circle responses, wallpaper failure, storage audit, legacy image
  dimensions, scrolling through token refreshes, and returning to album photos.
  The unchanged 10-second account/membership polling continued; the scroll fixture
  performed four account/snapshot checks, with no reloads of already-visited
  photos during later token rotation. Album returns introduced no extra photo
  requests.

The synthetic wallpaper fixture previously combined `source: "preset"` with a
wallpaper path, which theme validation rejects. It now correctly uses `source:
"ai"`. Layout measurements explicitly wait for the private wallpaper frame and
decoded image. The wallpaper-failure regression now first asserts the wallpaper
was actually present before testing removal. These changes affect test data only.

Controlled measurements against the prior `03f4d22243fe2df874eba3e2dbd61dc13793f3a9`
export, using identical synthetic content and wallpaper:

| Viewport width | First photo starts before | First photo starts after |
| -------------- | ------------------------: | -----------------------: |
| 320px          |                     831px |                    322px |
| 390px          |                     788px |                    307px |
| 1024px         |                     811px |                    307px |
| 1440px         |                     839px |                    335px |

The compact header measured 119px tall in all four fixtures, with no horizontal
overflow. These are local layout positions, not hosted speed measurements or a
guarantee for every device/font setting. The synthetic landscape wallpaper is
not a claim about generated artwork. No hosted account, uploads, invitations,
emails, provider calls, or paid generation were used.

Reproduction: [photo-first browser guide](../e2e/photo-first/README.md).
Local reports/screenshots are under `/tmp/circle-photo-first`; media regressions
are under its `performance-final` and `performance-album` subdirectories.

## Deployment handoff

The base remote main was freshly reconciled at
`03f4d22243fe2df874eba3e2dbd61dc13793f3a9`, with no intervening changes at inspection.
Publish the reviewed local commit only when approved, then verify Vercel's
automatic Production deployment is Ready at the exact published full SHA before
calling it live.

**No Appwrite archive, function redeployment, dashboard changes, or environment
variable changes are needed.** All three Appwrite bundle files are unchanged.
Keep the current Appwrite deployment and configuration. Users should refresh old
tabs after the matching frontend is deployed. Hosted signed-in behavior and
native touch gestures remain unverified.
