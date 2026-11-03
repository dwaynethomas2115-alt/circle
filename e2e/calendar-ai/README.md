# Calendar AI browser checks

Export using the dummy Appwrite configuration in [the shared harness guide](../performance/README.md), with output `/tmp/circle-calendar-web`, then serve:

```sh
python3 e2e/performance/serve.py /tmp/circle-calendar-web --port 4203
```

Run the real exported UI against synthetic responses:

```sh
CIRCLE_SMOKE_BASE=http://127.0.0.1:4203 \
CIRCLE_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
CIRCLE_SMOKE_OUTPUT=/tmp/circle-calendar-browser \
CIRCLE_SMOKE_LABEL=calendar \
node e2e/calendar-ai/smoke.cjs
```

The harness blocks all unexpected external requests. It verifies per-event review and final confirmation, edits invalidating review, missing-time clarification, identical retries after lost save responses, stable analysis IDs on provider failure, UTF-8 attachments, bounded image conversion, unsupported files, source changes clearing drafts, and excluding events from a batch. Reports are written by the shared harness. These are mocked browser checks, not real OpenAI extraction or physical-device picker verification.
