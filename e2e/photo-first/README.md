# Photo-first Circle layout checks

This harness uses synthetic users and photos from the repository. Every external
request is intercepted; unexpected destinations, mutation calls, and page errors
fail the scenario. It never connects to a live Circle account or backend.

Use an exported web app with the same dummy Appwrite configuration as
[the performance harness](../performance/README.md), then serve that export on
loopback with `e2e/performance/serve.py`.

```sh
python3 e2e/performance/serve.py /tmp/circle-photo-first/web --port 4195
```

In another terminal:

```sh
CIRCLE_SMOKE_BASE=http://127.0.0.1:4195 \
CIRCLE_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
CIRCLE_SMOKE_OUTPUT=/tmp/circle-photo-first \
CIRCLE_SMOKE_LABEL=photo-first-final \
node e2e/photo-first/smoke.cjs final
```

Omit `CIRCLE_CHROMIUM_EXECUTABLE` to use Playwright's installed browser. The
shared helper rejects origins outside HTTP loopback. Optional `CIRCLE_CASE`
filters scenario names. Each passing case updates the report; failures are not
recorded as passes. Repeating a case replaces its prior report entry.

The final suite has 15 distinct scenarios: four viewport layouts (320, 390, 1024,
1440 pixels), month selection and sorting/reset/clear, keyboard photo editing and
square crop movement/cancellation, core navigation, Circle-scoped creation on
phone and desktop, member permissions, membership revocation with filters or
photo editing open, manager-role reduction, new-Circle photo selection, and an
empty Circle without a photo. File selection uses a repository JPEG and stops
before upload or save.

Run `baseline` instead of `final` against the prior exported app to record the
same four viewport measurements and screenshots. The harness writes screenshots,
full service/interception reports, and compact summaries under
`CIRCLE_SMOKE_OUTPUT`. First-photo positions describe these controlled local
fixtures; they are not live performance timings, physical-device tests, or a
guarantee for every theme/content size.

Geometry checks wait for the private wallpaper frame and its decoded image before
measuring. The shared fixture's wallpaper theme uses `source: "ai"`, as required
by theme validation for an attached wallpaper path. The previous `preset` value
was invalid and silently selected the plain fallback theme. Both baseline and
final measurements must use the corrected fixture; earlier plain-theme captures
are not comparable to these decorated captures. The mocked wallpaper image uses
the repository landscape photo, so it does not represent generated artwork.
