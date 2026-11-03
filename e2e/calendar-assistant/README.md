# Calendar assistant browser checks

These checks use real Circle UI and local file selection, with synthetic accounts
and explicitly intercepted Appwrite responses. Every non-loopback request passes
through the shared safe fixture; unexpected destinations, uploads, writes, and
browser errors fail a scenario. No real calendar, account, file store, OpenAI
provider, or paid generation is contacted.

Export the web app with the dummy configuration documented in
[the performance guide](../performance/README.md), then serve it on loopback:

```sh
python3 e2e/performance/serve.py /tmp/circle-calendar-ai/web --port 4203
```

Run the harness:

```sh
CIRCLE_SMOKE_BASE=http://127.0.0.1:4203 \
CIRCLE_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
CIRCLE_SMOKE_OUTPUT=/tmp/circle-calendar-ai \
CIRCLE_SMOKE_LABEL=calendar-final \
node e2e/calendar-assistant/smoke.cjs
```

The shared origin guard accepts HTTP loopback only. Omit the executable override
to use Playwright's installed browser. `CIRCLE_CASE` optionally filters scenario
names. Each passing case updates its report entry; a rerun replaces the prior
entry instead of increasing the unique count.

The 17 scenarios cover:

- Opening Calendar AI at 320px/390px causes no AI or calendar-write request.
- Typed proposals require field review, reset review after edits, and require a
  final explicit confirmation. Double clicking confirmation dispatches one batch.
- Missing year, time, or timezone leaves saving disabled until corrected/reviewed.
- TXT/CSV attachment selection sends transient text data only after Propose events.
- Photo selection produces a bounded JPEG analysis source without a storage upload.
- Changing/removing an attachment clears proposals/history from its previous source.
- Unsupported PDF is rejected before AI analysis.
- Instructions/HTML in an attachment or response remain inert review text.
- Provider failure retains input, and retry requires a new explicit action.
- A lost import response can be retried without duplicate mock events.
- Late responses cannot show proposals after account, membership, or Circle changes.
- Desktop proposal/confirmation layouts remain readable without a save.
- Manual calendar creation remains available without using AI.

The photo fixture is a repository JPEG; its returned event data is a mock. These
tests do not establish OCR accuracy, model access, real charges, or native picker
behavior. Duplicate response behavior here uses a mock ledger; actual repository
transaction/idempotency tests are separate backend evidence.

Reports and screenshots are written under `CIRCLE_SMOKE_OUTPUT`. The compact
report is `calendar-summary.json`; the shared full report uses
`CIRCLE_SMOKE_LABEL`. Local/session storage are checked for absence of retained
private input in every scenario.
