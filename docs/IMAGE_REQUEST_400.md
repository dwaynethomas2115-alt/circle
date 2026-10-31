# Wallpaper image-request diagnosis and deployment handoff

## Reported hosted evidence

The following facts were supplied by Dwayne and Dot on October 31, 2026. They are not a fresh Appwrite dashboard inspection from this workspace.

| Item                                     | Supplied evidence                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| Appwrite project / Function              | `6ae3ee7000368dcb80e7` / `circle-api`                                             |
| Active deployment for the failed attempt | `6ae5e308dbe2939faa49`                                                            |
| Source                                   | `10606612f64401fd5b3b6b274c282a20f0e0addf` (`1060661`)                            |
| Failed execution                         | `6ae5e9a4c0253bc87804`                                                            |
| Event / application code                 | `wallpaper_provider_error` / `provider_request`                                   |
| Stage / upstream HTTP status             | `image` / `400`                                                                   |
| OpenAI request ID                        | `req_6642c2b0c3c842b2afbb351993f440b0`                                            |
| Missing detail                           | No `providerCode` or rejected-option detail was recorded; the Logs tab was empty. |

The reported error was: “OpenAI could not accept Circle's wallpaper image request settings. The app owner needs to check the configured model, endpoint, and supported options; changing your description may not resolve this.” The application used a general message for unclassified upstream HTTP 400/422 responses. That message does not prove which setting OpenAI rejected.

This attempt reached the image stage after the earlier palette-authentication failure. Dot reported that Dwayne saved the existing server key and approved rebuilding the same source as deployment `6ae5e308dbe2939faa49`. The key was not read here, and this evidence does not establish access to every image model or successful hosted wallpaper generation.

The shared-bucket JPEG update was already deployed from `1060661`, with matching Vercel code. The former requirement for a second wallpaper bucket is resolved. Keep using private JPEG wallpapers in the existing `circle-media` bucket; this diagnosis requires no bucket or permission change.

## Current official OpenAI evidence

Public OpenAI-maintained documentation and SDK sources were read on October 31, 2026. Pinned links preserve the exact source reviewed:

- [OpenAI OpenAPI specification: image model lifecycle](https://github.com/openai/openai-openapi/blob/2e9ebb365c2e8332c73f3ee8b562dca8dc0047ce/openapi.yaml#L47878-L47929): “`gpt-image-1` was shut down on October 23, 2026.” It names `gpt-image-2.5-sunburst` and `gpt-image-2.5-flare` as replacements.
- [Official Python SDK: image generation parameters](https://github.com/openai/openai-python/blob/0dcd904bc2fed26c737d9740bca5f6b0ecc4cb7f/src/openai/types/image_generate_params.py#L34-L51) and [official Node SDK](https://github.com/openai/openai-node/blob/c717857c3151bde92e07e4d396301a9c67163e68/src/resources/images.ts#L823-L833) independently state the same shutdown date.
- [OpenAI OpenAPI specification: image generation endpoint](https://github.com/openai/openai-openapi/blob/2e9ebb365c2e8332c73f3ee8b562dca8dc0047ce/openapi.yaml#L9768-L9782) documents `POST /images/generations` with a JSON request. Circle uses the corresponding `https://api.openai.com/v1/images/generations` endpoint.

The source at `1060661` defaults to `gpt-image-1` when `OPENAI_THEME_IMAGE_MODEL` is unset or empty. Dot last reported no Function-specific image-model or quality override. An applicable inherited setting and the effective model used for the historical execution have not been independently verified here.

The remaining submitted values match the documented GPT Image request options:

| Submitted value          | Official supported-options evidence                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `n: 1`                   | [1–10 images](https://github.com/openai/openai-openapi/blob/2e9ebb365c2e8332c73f3ee8b562dca8dc0047ce/openapi.yaml#L47930-L47938)                                                  |
| `quality: "medium"`      | [`low`, `medium`, and `high` for GPT Image models](https://github.com/openai/openai-openapi/blob/2e9ebb365c2e8332c73f3ee8b562dca8dc0047ce/openapi.yaml#L47939-L47972)             |
| `output_format: "jpeg"`  | [`png`, `jpeg`, or `webp`](https://github.com/openai/openai-openapi/blob/2e9ebb365c2e8332c73f3ee8b562dca8dc0047ce/openapi.yaml#L47985-L47997)                                     |
| `output_compression: 85` | [0–100 with JPEG or WebP](https://github.com/openai/openai-openapi/blob/2e9ebb365c2e8332c73f3ee8b562dca8dc0047ce/openapi.yaml#L47998-L48006)                                      |
| `size: "1536x1024"`      | [Documented standard GPT Image size](https://github.com/openai/openai-openapi/blob/2e9ebb365c2e8332c73f3ee8b562dca8dc0047ce/openapi.yaml#L48019-L48059)                           |
| `background: "opaque"`   | [Documented background option; transparency requires PNG/WebP](https://github.com/openai/openai-openapi/blob/2e9ebb365c2e8332c73f3ee8b562dca8dc0047ce/openapi.yaml#L48072-L48106) |

These current generic option descriptions do not make the retired `gpt-image-1` model available. They provide no basis for removing JPEG, compression, or opaque background as the supposed fix.

**Confirmed code issue:** the unset image-model configuration silently selects a retired model. **Unproven historical cause:** that retired default caused this particular HTTP 400 response. The execution did not retain enough upstream detail to establish the exact cause. The user's description is not established as the cause either.

## Prepared request-code correction

The corrected server requires an explicit, nonempty `OPENAI_THEME_IMAGE_MODEL` setting. It rejects the retired IDs `gpt-image-1`, `dall-e-2`, and `dall-e-3` locally before either palette or image generation. It does not pick or try a replacement model. An explicit model setting is a prerequisite, not proof that the OpenAI project can use that model.

The image request retains the documented JPEG output, compression, opaque background, size, and quality. The existing `OPENAI_THEME_MODEL=gpt-6-luna` palette setting stays unchanged. Private shared-bucket storage, access checks, and signed-link behavior stay unchanged.

Provider diagnostics retain only allowlisted categories. Alongside stage, upstream status, recognized `providerCode`, and validated request ID, the correction can record recognized `providerType` and `providerParam` values. Raw provider messages, response/request bodies, prompts, authorization headers, and secret values are not diagnostic output. This improves any future separately authorized failure report; it cannot recover detail discarded by the historical deployment and is not a reason to retry a paid request.

The code change and simulated tests can establish local validation and request handling. They cannot prove image-model access, accepted hosted requests, actual charges, or end-to-end wallpaper generation.

## Exact remaining owner action

Dot should first read the non-secret effective image-model and quality settings, including any applicable inherited settings, without changing them. An absent Function-specific variable alone does not prove there is no applicable override. Use the existing request ID to inspect any available existing OpenAI request record or ask OpenAI support for the rejected model/option; do not retry generation to recover details.

Identify the OpenAI project associated with the existing server key using owner records and dashboard metadata, without revealing or changing that key. Read the current model documentation and project access information for a supported GPT Image model that accepts the JPEG options above. The official replacement recommendations are `gpt-image-2.5-sunburst` and `gpt-image-2.5-flare`; neither is automatically selected by Circle. Availability to this particular project and final usage cost remain unverified.

**One proposed replacement for approval:** `gpt-image-2.5-sunburst`, keeping `output_format=jpeg`, `size=1536x1024`, `quality=medium`, `output_compression=85`, and `background=opaque`. The pinned official model documentation explicitly recommends this model and documents these options. This is a compatibility recommendation, not a verified least-cost choice. Do not save it as configuration during this diagnosis.

**Official standard token pricing, verified by Dot and supplied by Dwayne on October 31, 2026:** the [OpenAI `gpt-image-2.5-sunburst` model page](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst) lists:

| Billing category | USD per 1 million tokens |
| ---------------- | ------------------------ |
| Text input       | $5                       |
| Image input      | $8                       |
| Image output     | $30                      |

These are token rates, not prices per wallpaper. The current generation request supplies text rather than an input image; the image-input rate is included for completeness. The existing, separate Luna palette request can add its own charges, which these image-model rates do not cover.

The model page explicitly says these token rates match GPT Image 2, but the GPT Image 2 calculator does **not** estimate GPT Image 2.5 token consumption. There is no verified fixed per-image price for `medium` at `1536x1024`. Total wallpaper cost varies with billable token usage, so do not derive a per-image estimate from another model's calculator or old price table. No generation was run to measure cost.

This pricing evidence is Dot's read-only official-page verification relayed by Dwayne, not an independent page fetch from this workspace. The earlier normal proxied pricing-page GET returned HTTP 403; no network-policy change or bypass was used. The recommendation is now supported by official compatibility documentation and the supplied current token rates, with the per-wallpaper cost limitation explicit. It does not establish this OpenAI project's model access, actual generation cost, or successful hosted generation.

Dwayne must still separately approve the proposed `gpt-image-2.5-sunburst` choice with variable token billing, saving that non-secret `OPENAI_THEME_IMAGE_MODEL` setting in Appwrite, and deploying the prepared server update. Supplying pricing does not approve any of these actions. Keep `OPENAI_THEME_MODEL=gpt-6-luna`, the existing secret key, database, storage, permissions, billing, and plan unchanged. If access would require another account, billing, credential, permission, or verification action, report that action for separate coordination instead of performing it.

No live generation or retry is required to inspect documentation, configuration, or deployment status. A later paid generation test needs its own authorization.

## Local verification

The code correction and rebuilt bundle are in local commit `93cfd6859e1c0359e1d7d4e1fb31541423e40af9`. The following checks were completed for that code; this pricing follow-up changes documentation only.

- `npm run test:appwrite`: 80 passed, zero failed or skipped; provider requests use injected mocks.
- `npm test`: 87 passed, zero failed or skipped.
- `npm run typecheck` and `npm run lint`: passed.
- `npm run build:appwrite`: rebuilt the Node.js 22 deployment bundle; importing its handler passed without making a provider request.
- Regression coverage preserves Luna, JPEG options and private storage behavior; missing/retired image models produce zero provider calls; image failures retain safe error type/option names only in server logs; no model fallback or automatic retry is introduced.

These are local checks only. No Appwrite/Vercel deployment, live provider call, key reveal, or production setting change was performed.

## Deployment steps after separate approval

1. Identify the exact reviewed source commit or archive containing the correction and rebuilt `appwrite/function/main.js`. Do not push to `main` as part of this handoff: a main push could trigger Vercel. This server-only correction does not require a website rebuild or Vercel configuration change.
2. Build the reviewed source with `npm run build:appwrite` before packaging, unless using its already rebuilt committed bundle. Appwrite runs the JavaScript bundle, not the unbundled TypeScript source. Do not reuse the old `1060661` bundle for this code update.
3. Obtain exactly `appwrite/function/main.js`, `appwrite/function/package.json`, and `appwrite/function/package-lock.json` from that same approved source. If fetched from GitHub, verify each Git blob hash against the approved commit as Dot has done previously. Package those three files at the archive root; omit `.env` files, secrets, local dependencies, and unrelated repository files.
4. Only after the separate configuration approval, save the approved `OPENAI_THEME_IMAGE_MODEL` in the existing Appwrite Function. Do not reveal or replace `OPENAI_API_KEY`; do not change Luna or image quality implicitly.
5. Upload the one-time source archive to existing project `6ae3ee7000368dcb80e7`, Function `circle-api`, at `https://fra.cloud.appwrite.io/v1`. Keep Node.js 22, entrypoint `main.js`, build command `npm ci --omit=dev`, and timeout 180 seconds. A redeploy of the old source alone cannot install this code correction.
6. Preserve execution permission `users`; retain exactly `rows.read`, `rows.write`, `files.read`, `files.write`, and `tokens.write`. Preserve schedules/events, database, existing `circle-media` file security, bucket grants, extensions, size ceiling, and every other setting. Do not run provisioning or create a second bucket.
7. Wait for a successful build and an active deployment. Record the new deployment ID, exact source version, build result, and presence of the approved non-secret image-model setting. Confirm the existing server secret stays marked Secret without opening its value. These checks establish deployment/configuration, not working hosted generation.
8. Leave Vercel and its four public Appwrite variables unchanged. Report any differences from the approved source or settings before taking further action. Do not run a wallpaper generation, provider request, or paid retry to verify deployment.

No deployment, push, live OpenAI request, credential reveal/change, permission change, storage change, billing change, or plan change is authorized by this diagnosis and handoff.
