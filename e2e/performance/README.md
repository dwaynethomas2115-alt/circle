Run these browser checks from the repository root using the existing npm dependencies and Python 3.9 or newer. They use synthetic Appwrite responses and repository image assets. Every browser request outside the local export is intercepted; the fake Appwrite host is fulfilled locally and any other external request fails the case.

Export the app with the exact dummy backend values expected by the harness:

```bash
EXPO_NO_DOTENV=1 \
EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 \
EXPO_PUBLIC_BACKEND=appwrite \
EXPO_PUBLIC_APPWRITE_ENDPOINT=https://circle-test.example/v1 \
EXPO_PUBLIC_APPWRITE_PROJECT_ID=circle-test \
EXPO_PUBLIC_APPWRITE_FUNCTION_ID=circle-api \
npx --no-install expo export --platform web --max-workers 2 \
  --output-dir /tmp/circle-performance-web
```

Start the local server in another terminal. It binds only to `127.0.0.1`, serves client-router deep links, and returns 404 for missing assets:

```bash
python3 e2e/performance/serve.py /tmp/circle-performance-web --port 4191
```

Run the suite against that explicit loopback origin:

```bash
CIRCLE_SMOKE_BASE=http://127.0.0.1:4191 \
node e2e/performance/smoke.cjs all
```

Use `perf` for eight loading, scrolling, album reuse, polling, startup, and access checks; use `regressions` for fourteen image recovery, account/access transitions, overlap, logout, legacy dimension, and storage checks. `all` runs both suites. The performance suite includes a real 31-second idle polling interval and an eleven-second feature response.

`CIRCLE_EXPECT_FIXED` defaults to `1`. To collect performance evidence from an earlier app version, set it to `0` and use a separate report label:

```bash
CIRCLE_SMOKE_BASE=http://127.0.0.1:4191 \
CIRCLE_EXPECT_FIXED=0 CIRCLE_SMOKE_LABEL=baseline \
node e2e/performance/smoke.cjs perf
```

Baseline mode records reload, startup overlap, foreground request, and slow feature measurements without enforcing their improvement expectations, so its report may show expected performance regressions. Membership polling, current authorized URLs, request blocking, and access assertions remain enforced. The `regressions` suite always enforces every assertion, regardless of this setting.

Filter case names with a regular expression for a focused rerun:

```bash
CIRCLE_SMOKE_BASE=http://127.0.0.1:4191 \
CIRCLE_CASE='expired|logout|late captured|late previous|storage' \
CIRCLE_SMOKE_LABEL=review \
CIRCLE_SMOKE_OUTPUT=/tmp/circle-performance-review \
node e2e/performance/smoke.cjs regressions
```

`CIRCLE_SMOKE_OUTPUT` defaults to `/tmp/circle-performance-smoke`; `CIRCLE_SMOKE_LABEL` defaults to `smoke`. Each passed case is written immediately to `<output>/<label>-report.json`. Reruns retain reports for other case names and replace the report for the same case name. Performance cases also save screenshots there. A failed case exits unsuccessfully and does not receive a passed report.

The harness uses Playwright's installed Chromium by default. If needed, install its browser with `npx --no-install playwright install chromium`, or point `CIRCLE_CHROMIUM_EXECUTABLE` at an existing Chromium binary, for example `/usr/bin/chromium`.

`CIRCLE_SMOKE_BASE` is required and accepts only an HTTP origin on `127.0.0.1`, `localhost`, or `[::1]`, with an optional port and no credentials, route, query, or fragment. This harness measures a local exported app with controlled latency. It does not measure hosted Appwrite latency or verify physical devices, real sessions, server deletion, or browser/OS cache erasure.
