# Clear Circle cover-photo editing

Owners and admins now see a persistent **Change cover photo** camera button directly on the Circle's header image. The whole header image is a click/tap target. A Circle without a cover shows **Add cover photo** instead. **Settings → Cover photo** provides the same editor as the first settings section.

The editor lets the user choose a photo, preview it locally, then explicitly **Save cover photo** or **Cancel**. The header is unchanged before Save. Wide photos work best; the header crops responsively to fit the screen. Picker permission is requested only when choosing on native platforms; web opens the file chooser directly from the user gesture.

The existing action `updateCircle(circleId, { cover: selectedUri })` handles JPEG preparation, private upload/sealing, and the cover update. It changes no other Circle fields. A cover-only refresh no longer clears unrelated unsaved name, description, or access-setting drafts. Close/Cancel controls are disabled while an operation is in flight, so they do not imply rollback of a submitted save. Unknown save outcomes tell the user to check the Circle before retrying.

Both the page controls and editor retain owner/admin checks. Picker, save, and preview callbacks are scoped to the current account, Circle, role, visibility, and selection. Role loss or navigation cannot carry a draft into another Circle. Existing server authorization and owned-media checks remain authoritative.

## Verification

- 95 client tests, type checking, lint, and diff checks passed.
- 21 fully intercepted browser scenarios passed at 1440, 390, and 360 pixels wide.
- Browser coverage includes owner/admin visibility, member/nonmember restrictions, missing-cover Add controls, picker/draft cancellation without writes, local preview, the existing JPEG upload flow with project header/content range/owner ACLs, a cover-only patch, persistence after reload, explicit save rejection, role loss, and preservation of unrelated Settings drafts.
- All accounts, uploads, and API responses were mocked with bundled sample images. No personal photo, real account, live storage upload, or provider call was used. Responsive browser checks do not establish native-device picker behavior or real hosted storage success. The rejected-save scenario does not simulate a lost response after an unknown commit.

## Publication

This is a website/frontend update only. **No Appwrite Function redeployment, model change, new variable, dependency, schema, bucket, credential, permission, billing, or plan change is needed.** The existing deployed Function already supports authorized cover updates. All `appwrite/function` files remain unchanged from `b806b4ce86eb8aa29d7223922c0f042bb52d0270`.

Publish the reviewed source to the existing Circle GitHub repository after reconciling any intervening work. The established Vercel integration can deploy the website; verify its actual Ready/current commit separately. Dot does not need to package or upload another backend archive for this change.
