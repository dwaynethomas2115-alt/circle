# Session recovery and movable cover-photo cropping

This frontend update addresses Dwayne's report that Circle appeared to log him out, then refused to create a session because one was already open. It also adds drag/zoom cropping to the cover editor, so the selected portion becomes the saved photo.

## Session recovery

The previous client cleared the signed-in user on every account or snapshot error, while an Appwrite cookie could remain valid. Sign-in then always attempted to create another session. That is a confirmed code path consistent with the report; the particular hosted failure/status was not inspected here.

The client now distinguishes a confirmed absent session (fresh account HTTP 401) from an uncertain connection/access failure. Uncertain reads clear private Circle data and show **Reconnect to Circle → Try again**, rather than asserting that the user signed out. A freshly verified own identity may be retained without avatars, memberships, posts, messages, themes, or signed media URLs. A snapshot must belong to the freshly checked account. A snapshot HTTP 401 rechecks the account before deciding whether it expired or the Function's access failed.

Sign-in freshly checks for an existing session. A matching email can reuse it; a different account is neither silently accepted nor deleted. The authentication page shows the verified current account, an explicit **Continue with current account** action that checks identity again, and **Use a different account** for user-requested sign-out. Recovery also offers explicit **Sign out on this device** so a persistent Function-access problem does not trap a user. No automatic session deletion or account switching is added. Invalid credentials remain failures. Existing-session races or ambiguous creation responses are accepted only after a fresh matching-account check.

Connection state is atomic. Reads coalesce during routine polling, but foreground/manual retries and authentication changes fence old results. Private writes and feature/media access are blocked while connection status is unknown. A persistent Expo Router `Navigator` keeps the current route and invitation fragment; the private `Slot` subtree is unmounted during recovery, so another account cannot inherit an old cover-editing draft or private image DOM. This avoids the route-reset behavior observed when the original conditional `Slot` owned the navigator itself.

## Move and zoom the cover photo

Open **Change cover photo → Choose cover photo**, then drag the original photo inside the crop frame. Pinch or use **Zoom in / Zoom out**, directional buttons, and **Reset crop**. The frame uses the measured dimensions of the visible Circle header rather than a fixed generic crop.

The preview and JPEG export use the same bounded source-pixel rectangle. Crops cannot pan past the original photo or expose blank edges. The selected rectangle is exported locally to JPEG (at most 2048 pixels on its longest edge, without enlarging smaller crops) and then uploaded through the existing private `updateCircle(circleId, { cover: croppedUri })` action. Browser export uses Canvas; native export uses the already-installed Expo ImageManipulator. The full original photo is not uploaded as the cover. Choosing, moving, zooming, resetting, or canceling does not upload or save anything.

Owner/admin requirements, scope guards, preview/Save separation, existing media validation/ACLs, and cover-only updates remain intact. Other Circle settings/drafts are not changed. The preview matches the current measured header; another device's responsive header shape may trim the already-cropped JPEG further. No new focal-point database field is introduced.

## Verification and release

All 121 client tests passed, including 17 session regressions, six crop-geometry tests, and three web JPEG-encoder tests. Type checking, lint, and diff checks passed. Offline iOS and Android exports passed, with source maps confirming the native crop helper was selected instead of the browser Canvas implementation.

All 42 fully intercepted browser scenarios passed at 1440, 390, and 360 pixels wide. Coverage includes bootstrap/snapshot recovery without route loss, confirmed absent sessions, verified session reuse, wrong-account refusal, explicit account switching/sign-out, fresh Continue identity checks, session-creation races, crop gestures and keyboard controls, frame aspect, Cancel, and role loss. Captured upload bytes were decoded to verify that the saved JPEG contained the selected test-image quadrant and matched the measured header aspect, rather than merely repositioning the displayed original.

Mocked account/session/storage calls and bundled or generated test fixtures are used; no real account, session deletion, personal upload, provider call, or paid generation is performed. Native bundle checks establish module resolution and compilation, not physical-device gestures or real storage behavior. Responsive browser checks do not verify hosted cookies/storage or a native photo-picker session.

This is a frontend-only release. **No Appwrite Function redeployment, database/schema change, new dependency, variable, secret, model, permission, bucket, billing, or plan change is needed.** The existing Function already supports authorized private cover uploads. All `appwrite/function` files remain unchanged from `8ad9b02d396d1f11ec5963d63a9f008fa40db561`.

Publish the reviewed source to the existing Circle GitHub repository after reconciling intervening work. The existing Vercel integration can deploy the website; verify its actual Ready/current commit separately. Do not upload another Appwrite archive or run a paid generation test for this update.
