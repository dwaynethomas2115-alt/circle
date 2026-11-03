# Calendar AI: local implementation and activation review

Prepared locally at Dwayne's request. No publication, deployment, production
configuration, real uploads, calendar mutations, or paid provider calls are
authorized by this implementation. The reconciled base is
`bbddc692ab2619a1d2ada0a4a569d9bc8d2c9216`.

## Member flow

Open a Circle's calendar, then Calendar AI. Type plans or choose one supported
attachment. Nothing is sent merely by opening the panel or choosing a file.
Propose events explicitly sends the calendar conversation, selected attachment,
reference date, and timezone for analysis.

The response is chat plus editable event proposals. Missing/unclear dates, years,
times, timezones, unreadable content, and unsupported recurring/all-day semantics
are flagged. Missing years/end times are not filled with defaults. Users can
reply, edit fields, exclude proposals, and resolve daylight-saving ambiguity by
choosing a matching UTC offset. Each included event needs its own review checkbox;
editing resets it. Review events opens a separate confirmation of the exact batch.
Only the final Confirm save action writes events.

File replacement/removal clears prior analysis so proposals cannot be mistaken
for output from the newly selected document. Account, Circle, role, membership,
or authentication changes clear the transient session and fence late callbacks.
The existing manual calendar remains available.

## Supported inputs and hard limits

| Input              | First-version support                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Typed description  | Up to 4,000 characters per message                                                            |
| Chat context       | Last six messages, at most 2,000 characters each / 12,000 total                               |
| TXT / CSV          | One readable, strict UTF-8 file, up to 12,000 bytes; UTF-8 BOM accepted                       |
| Calendar photo     | One static JPEG, PNG, or WebP, up to 10 MiB and 20 megapixels                                 |
| Prepared image     | Re-encoded JPEG, maximum 1,600px per side and 120 KiB; clearer cropped sections may be needed |
| Proposals / import | Maximum 20 events per analysis and confirmed batch                                            |
| Import payload     | Existing 24,000-byte total request cap; shorten details/select fewer if exceeded              |
| Analysis payload   | Separate 240,000-byte cap; ordinary requests retain their 24KB cap                            |

PDF, DOCX, XLSX/XLS, ICS, HTML, SVG, HEIC, GIF, animated images, remote URLs, and
other arbitrary formats are rejected. CSV means readable comma-separated text,
not an Excel workbook. Recurrence and all-day event types are not implemented;
individual timed occurrences can be entered/reviewed instead. Existing calendar
rules require future starts and an end after the start, so this is not a historical
calendar archive importer. Date-only or missing-year documents require clarification.

Photo recognition and completeness are not verified against a live model. Check
every event against its source, including event counts. Large calendars must be
split; the model is instructed to flag unprocessed sections rather than claim a
complete extraction. No OCR accuracy guarantee is made.

## Architecture and access

- `CalendarAssistantPanel.tsx` is integrated into `CalendarPanel.tsx`; shared
  validators/timezone conversion are in `calendarAssistant.ts`.
- The Expo document picker supports local file selection on web/iOS/Android.
  Input signatures, UTF-8, bytes, dimensions, formats, and local URI restrictions
  are checked before preparing sources. Only the SDK-compatible
  `expo-document-picker ~14.0.8` dependency was added.
- New Appwrite `calendarAssistant` reads verify membership before provider work
  and again before returning proposals. They do not write events. The helper uses
  the existing server-only OpenAI key at runtime; no key value was inspected,
  copied, transmitted in tools, put in client configuration, or changed.
- New `importCalendar` writes require `confirmed: true`, validate the entire batch,
  recheck membership inside existing transactions, and use the existing private
  events records. No new tables, bucket, columns, permissions, scopes, or migration
  are required.
- Duplicate matching uses normalized title, UTC start/end, and location, ignoring
  description. All selected-Circle events are checked, including those outside the
  recent 100-event projection. Deterministic Circle-specific IDs and transaction
  guards protect concurrent/retried matching imports and lost-response retries.
  This is not semantic matching of reworded events or a permanent import ledger;
  deleting an event or changing its matching fields permits a new import.
- Sources, filenames, chat history, and prior assistant replies are untrusted data.
  The model has no tools, URL fetching, write function, security action, or secret
  lookup. Strict JSON output and whitelisted event fields are validated again;
  plain Text rendering does not execute embedded document instructions.

Existing Appwrite accounts/media/storage, Luna palette configuration, Sunburst
wallpaper configuration, and upload/recovery work are preserved.

## Disabled activation and model/cost proposal

Calendar inference is **disabled when `OPENAI_CALENDAR_MODEL` is unset**, with no
fallback to the palette model. No production setting was added or changed.

Proposed choice, requiring separate approval: set the new function variable
`OPENAI_CALENDAR_MODEL=gpt-6-luna`, retaining the existing secret key. This uses
image understanding and strict structured JSON, not image generation, tools,
calendar-account access, email, or external calendar connections. It introduces a
new spending scope: every Circle member may explicitly analyze input, including
follow-up messages that resend the selected attachment/context.

Dot supplied current official evidence during this task:

- [Luna model capabilities and pricing](https://developers.openai.com/api/docs/models/gpt-6-luna):
  image input and structured outputs supported; standard text input $0.10 per
  million tokens, output $0.50 per million; a threshold uplift above 272K input
  and 10% EU regional uplift are listed.
- [Official image cost calculator guidance](https://developers.openai.com/api/docs/guides/image-cost-calculator):
  image input token use depends on resolution/detail. There is no verified fixed
  price per photo or imported calendar. The coding environment could not fetch
  those pages directly; these current facts were explicitly relayed by Dot.

Illustrative USD costs using those standard **text-token** rates:

| Assumed input / output | Standard text subtotal | With 10% EU uplift |
| ---------------------- | ---------------------: | -----------------: |
| 2,000 / 500 tokens     |               $0.00045 |          $0.000495 |
| 10,000 / 2,000 tokens  |                 $0.002 |            $0.0022 |
| 30,000 / 6,000 tokens  |                 $0.006 |            $0.0066 |

These are bounded examples, not measured usage or a billing ceiling. Add image
input tokens at the applicable official rate, and account for actual response
length/other applicable pricing. The code requests at most 6,000 completion tokens
and makes one provider request per explicit analysis, with no automatic retries
or silent fallback. Response refusal, truncation, or invalid JSON produces no
calendar write. Existing model/project access still needs verification.
A lost or timed-out analysis response does not prove there was no provider charge;
an explicit retry can incur another analysis charge. Imports are separately
deduplicated; analysis does not have a durable provider-job ledger.

The overlap guard is per process, not a durable member/day or project budget.
Before enabling, Dwayne should approve calendar-model spending and decide an
acceptable member/project allowance. A suggested starting policy is ten analyses
per member per day plus a project budget alert; that durable quota is **not**
implemented or silently configured here. Appwrite execution/bandwidth and future
native build costs depend on existing service plans; no plan/billing change was made.

## Privacy and retention limits

Circle code does not persist chat, source bytes, or proposals into its database,
bucket, localStorage, or sessionStorage. Inputs traverse Appwrite and OpenAI when
explicitly analyzed. `store: false` is sent to OpenAI, but this is not a guarantee
of zero retention: hosting execution metadata, provider policies, abuse monitoring,
and OS/app picker caches require owner/platform review. Temporary conversions and
supported picker cache copies are cleaned up where safe; originals are preserved.
Clearing the panel is not a promise to erase delivered bytes or OS caches.

## Tests and deployment review

All tests use fake services or intercepted loopback browser requests; no real
calendar event, upload, provider request, credential change, or paid test is used.
The final checks pass: 176 client/helper tests, 108 backend tests, 17 Calendar AI
browser scenarios, and seven existing private-media browser regressions. That is
284 automated tests and 24 distinct mocked-browser scenarios. TypeScript, ESLint,
formatting, diff checks, and web/iOS/Android exports pass.
See [browser reproduction instructions](../e2e/calendar-assistant/README.md).
Mocked extraction proves workflow and validation, not real OCR/model accuracy.
Native exports are bundling checks; physical device pickers remain unverified.

After separate publication/deployment approval, this feature requires matching
frontend and Appwrite code. Package the committed `appwrite/function/main.js`,
`package.json`, and `package-lock.json` at archive root for the existing function.
The two function package files are unchanged; `main.js` is rebuilt. Keep execution
permission `users`, current scopes/runtime/build/timeout, bucket settings, keys,
and existing model variables. Deploying code alone leaves analysis disabled.
Only after explicit spending/model approval should Dot add the new model variable.
A live billable accuracy/access test also requires separate approval.

Reviewed deployment file Git blob hashes:

| File at archive root | Git blob SHA                               |
| -------------------- | ------------------------------------------ |
| `main.js`            | `7c454bff9dd33aabc61fbe3010e266be520ee226` |
| `package.json`       | `179070395e599eeae177b52c4dddf5746d7b5b27` |
| `package-lock.json`  | `54785bc26284ff14eb3b23b2161b5ae74fbe3c93` |

Remaining owner decisions: calendar spending/model activation; durable usage budget;
whether a later version should support PDF/ICS, recurring/all-day/past events, or
external calendar synchronization. None are silently enabled in this version.
