# Calendar assistant browser checks

These checks use real Circle UI and local file selection, with synthetic accounts
and explicitly intercepted Appwrite responses. Every non-loopback request passes
through the shared safe fixture; unexpected destinations, uploads, writes, and
browser errors fail a scenario. No real calendar, account, file store, OpenAI
provider, or paid generation is contacted.

Export the web app with the dummy configuration documented in
[the performance guide](../performance/README.md), then serve it on loopback:

```sh
python3 e2e/performance/serve.py /tmp/circle-calendar-reconciled/web --port 4204
```

Run the harness:

```sh
CIRCLE_SMOKE_BASE=http://127.0.0.1:4204 \
CIRCLE_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
CIRCLE_SMOKE_OUTPUT=/tmp/circle-calendar-reconciled \
CIRCLE_SMOKE_LABEL=calendar-reconciled \
node e2e/calendar-assistant/smoke.cjs
```

The shared origin guard accepts HTTP loopback only. Omit the executable override
to use Playwright's installed browser. `CIRCLE_CASE` optionally filters scenario
names. Each passing case updates its report entry; a rerun replaces the prior
entry instead of increasing the unique count.

The 23 reconciled scenarios cover:

- Opening Calendar AI at 320px/390px causes no AI or calendar-write request.
- Typed proposals require field review, reset review after edits, and require a
  final explicit confirmation. Double clicking confirmation dispatches one batch.
- Missing year, time, or timezone leaves saving disabled until corrected/reviewed.
- TXT/CSV attachment selection sends transient text data only after Propose events.
- Photo selection produces a bounded JPEG analysis source without a storage upload.
- Changing/removing an attachment clears proposals/history from its previous source.
- Unsupported PDF is rejected before AI analysis.
- Instructions/HTML in an attachment or response remain inert review text.
- Provider failure retains input and requires an explicit New analysis action before
  a fresh request ID can start another provider attempt.
- A lost asynchronous dispatch response resumes the same durable analysis result;
  asynchronous execution response bodies are never treated as private results.
- An uncertain analysis can be checked with its unchanged UUID, using virtual time
  to exercise the browser timeout without a two-minute real wait.
- Capability preflight requires enabled `gpt-6-luna` and the matching review
  contract. Old, disabled, or alternate-model backends receive no analysis source.
- A lost import response can be retried with the same request UUID and reviewed
  payload, returning the durable saved receipt without duplicate mock events.
- A wrong-Circle save receipt is rejected without clearing the reviewed proposal
  or showing a success notice. The synthetic server may already have committed;
  receipt rejection is not a claim that no write occurred.
- Late responses cannot show proposals after account, membership, or Circle changes.
- Desktop proposal/confirmation layouts remain readable without a save.
- Manual calendar creation remains available without using AI.

The photo fixture is a repository JPEG; its returned event data is a mock. These
tests do not establish OCR accuracy, model access, real charges, or native picker
behavior. Duplicate response behavior here uses a mock ledger; actual repository
transaction/idempotency tests are separate backend evidence. Claims and save
receipts in this fixture are an explicit synthetic ledger; no real Appwrite table
or deployment is inspected or changed by the harness. The pending-request test
advances a browser-only virtual clock; it is not a hosted latency measurement.

Reports and screenshots are written under `CIRCLE_SMOKE_OUTPUT`. The compact
report is `calendar-summary.json`; the shared full report uses
`CIRCLE_SMOKE_LABEL`. Local/session storage are checked for absence of retained
private input in every scenario.
