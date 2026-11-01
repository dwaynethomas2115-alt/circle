# Sparse wallpaper instruction refinement

Dwayne reports that he generated and applied a new wallpaper after the journal update, but it still did not have the requested solid background and small illustrations. This report concerns a new result, rather than merely moving an existing image. The actual artwork and its provider execution were not inspected from this workspace, so the precise reason for the visual mismatch is unconfirmed.

## Request change

The prior image prompt already requested a flat background and small illustrations, but described their scale and density qualitatively. The saved description also appeared after the fixed instructions. Older scene-style wording could compete with the intended layout; that is a plausible contributing factor, not a proven cause of this particular result.

The revised image request:

- Quotes the exact user description as JSON visual reference before a final fixed layout contract. The description supplies subjects and colors, rather than overriding composition or scale.
- Specifies the actual `1536x1024` canvas and asks for at least **90% plain, unmarked, uniform background**, with the same shade in empty areas and all four corners.
- Limits each illustration to a **64x64-pixel box**, approximately 4% of the canvas width, using recognizable flat 2D icons.
- Targets approximately 18 illustrations in a loose six-column, three-row arrangement. Repetition/arrangement can vary to include every subject while preserving the small size and open space.
- Explicitly excludes scenes, gradients, background textures, lighting, shadows, large central subjects, 3D rendering, and decorative filler.

These are more precise art instructions, not a programmatic guarantee about generated pixels. `background: "opaque"` controls transparency; it does not enforce a solid color. Mocked tests establish the outgoing request and unchanged API options, not whether a live generated image follows the instructions. No automatic inspection call or generation retry has been added.

## Preserved configuration and privacy

Keep `OPENAI_THEME_IMAGE_MODEL=gpt-image-2.5-sunburst` and `OPENAI_THEME_MODEL=gpt-6-luna`. The image endpoint, one-image count, JPEG output, `1536x1024`, medium default quality, compression 85, and opaque background remain unchanged. There are still only the existing palette and image provider requests; neither is executed during these checks.

No website layout, storage format, bucket, permissions, membership checks, token signing, credentials, database, billing, or plan changes are required. Existing wallpaper files remain untouched. The latest reported hosted source was `5a1afce740e6a30389ff1ca9e577e0ece646e584`, deployed as Appwrite `6ae6d6193f0a48d7234f`; that historical deployment does not include this refinement.

## Verification and Dot handoff

The mocked regression verifies the layout instructions, exact quoted description including quotes/newlines, precedence after older scene-style wording, unchanged saved prompt, unchanged API options, and no extra provider calls. All 81 backend tests passed, as did type checking, lint, and the bundle build. No website code changed, so the previous browser checks remain separate evidence for the existing layout.

Dot coordinates the next Appwrite deployment separately. Use the exact source commit in the publication handoff and package only these three files at the archive root:

| Archive file        | Repository path                       | Git blob SHA                               |
| ------------------- | ------------------------------------- | ------------------------------------------ |
| `main.js`           | `appwrite/function/main.js`           | `2d02c47588f3cf174e0f6fc7545cda02ee8ccea0` |
| `package.json`      | `appwrite/function/package.json`      | `179070395e599eeae177b52c4dddf5746d7b5b27` |
| `package-lock.json` | `appwrite/function/package-lock.json` | `54785bc26284ff14eb3b23b2161b5ae74fbe3c93` |

Use existing project `6ae3ee7000368dcb80e7` / Function `circle-api`. Preserve Node.js 22, entrypoint `main.js`, build command `npm ci --omit=dev`, timeout 180 seconds, user-only execution, current scopes, existing model/quality values, and every other setting. No variable change is needed. Publishing GitHub alone does not update the manually deployed Function.

No paid generation, provider request, new account, personal upload, credential reveal/change, or dashboard action was performed or authorized as a verification step. A successful deployment would establish that the revised instructions are active, not that new artwork has been visually verified. Do not retry or regenerate an image to test deployment.
