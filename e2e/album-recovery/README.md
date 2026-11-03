# Album reconnect and draft regression checks

These browser checks use only an exported app on HTTP loopback, synthetic
accounts, repository JPEGs, and explicit fake Appwrite responses. Every external
request is intercepted by the shared performance fixture. Unexpected destinations
or unhandled mutations fail the scenario. No live account, upload, email,
invitation, provider request, or paid generation is used.

Export with the dummy configuration described in
[the performance guide](../performance/README.md), then serve the output:

```sh
python3 e2e/performance/serve.py /tmp/circle-album-recovery/web --port 4202
```

Run against that export:

```sh
CIRCLE_SMOKE_BASE=http://127.0.0.1:4202 \
CIRCLE_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
CIRCLE_SMOKE_OUTPUT=/tmp/circle-album-recovery \
CIRCLE_SMOKE_LABEL=album-final \
node e2e/album-recovery/smoke.cjs final
```

The shared origin guard accepts HTTP loopback only. Omit the Chromium override to
use Playwright's installed browser. `CIRCLE_CASE` optionally filters names. Reports
are written after each passing case; a rerun replaces its prior entry rather than
inflating the count.

The 14 final scenarios cover:

- Ordered two-photo and ten-photo albums publish exactly one complete post.
- A 409 snapshot conflict while the second photo is uploading recovers without
  interrupting the album.
- An unavailable snapshot or exhausted conflict retries show recovery, hide the
  composer, and restore its caption, photo order, selected photo, and Circle only
  after reconnection. Restoring never submits automatically.
- Failure of the second upload preserves the draft and publishes no partial album.
- Selecting another approved Circle before recovery preserves that selected target
  on the same composer route.
- A confirmed post followed by a failed snapshot refresh does not restore that
  already-posted draft or duplicate its post.
- Changing to another account in the same Circle does not expose the old draft,
  including when the original account is subsequently verified again.
- Account change without membership, verified membership revocation, and explicit
  sign-out prevent private draft restoration.
- At 320px and 390px, signed-in Home starts with Your Circles and the feed, and
  Highlights puts its playable montage before secondary information.

Each fake upload needs a prior reservation, checks owner-only read/delete file
permissions, and must be finished before the fake post action accepts its
attachment. An existing synthetic photo remains present throughout. The tests
also check that localStorage and sessionStorage remain empty.

For the controlled regression demonstration, serve the immutable prior
`15a71dde4d4972bd395bbbe8cbc50d66b644da83` export on another loopback port and run
`baseline` instead of `final`. The baseline selects and reorders two photos,
starts the fake second upload, then returns a real-shaped 409 snapshot response.
It keeps later snapshot reads unavailable until manual retry so the recovery
screen can be observed reliably. Baseline recovery loses the caption and photos;
the final tests preserve them. This is a mocked reproduction of the coding race,
not proof of the exact hosted request failure or a live performance measurement.
