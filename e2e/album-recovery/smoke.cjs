#!/usr/bin/env node
// Synthetic accounts and explicit fake uploads only. Unexpected destinations fail.
const fs = require("node:fs");
const path = require("node:path");
const {
  assert,
  expect,
  fixture,
  launchBrowser,
  base,
  output,
  delay,
} = require("../performance/helpers.cjs");
const original = require("../performance/fixture.json");
const clone = (value) => JSON.parse(JSON.stringify(value));
const endpoint = "https://circle-test.example";
const mode = process.argv[2] || "final";
assert.ok(["baseline", "final"].includes(mode));
const filter = process.env.CIRCLE_CASE && new RegExp(process.env.CIRCLE_CASE);
const reportPath = path.join(output, `album-${mode}-summary.json`);
const reports = fs.existsSync(reportPath)
  ? JSON.parse(fs.readFileSync(reportPath))
  : [];
const fileUrl = (id) =>
  `${endpoint}/v1/storage/buckets/circle-media/files/${id}/view?project=circle-test&token=mock_private_1_${id}`;
function hold() {
  let release, start;
  const promise = new Promise((r) => (release = r));
  const started = new Promise((r) => (start = r));
  return { promise, release, started, start };
}
async function scenario(
  browser,
  {
    holdSecond = false,
    failSecond = false,
    failAfterPost = false,
    width = 390,
    secondCircle = false,
  } = {},
) {
  const h = await fixture(browser, { width, posts: 0, latency: 15 });
  const state = clone(original.state);
  state.users.forEach((u) => (u.avatar = `${endpoint}/mock/avatar.jpg`));
  state.circles[0].cover = fileUrl("coverfamily");
  if (secondCircle) {
    state.circles.push({
      ...clone(state.circles[0]),
      id: "trip",
      name: "Trip Circle",
      cover: fileUrl("covertrip"),
    });
    state.members.push({
      circleId: "trip",
      userId: "alex",
      role: "member",
      joinedAt: new Date().toISOString(),
    });
  }
  state.posts = [
    {
      id: "existing-photo",
      circleId: "family",
      authorId: "sarah",
      content: "Existing private photo",
      mediaType: "image",
      media: fileUrl("photoExisting"),
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      reactions: [],
    },
  ];
  let actor = state.users.find((u) => u.id === "alex");
  let authenticated = true,
    failures = [],
    failureStatus = 0,
    closed = false;
  const counts = {
    snapshot: 0,
    account: 0,
    begin: 0,
    storage: 0,
    finish: 0,
    cancel: 0,
    post: 0,
  };
  const actions = [],
    uploads = [],
    events = [];
  const second = hold();
  const reservations = new Map();
  const headers = {
    "access-control-allow-origin": base,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS,DELETE",
    "content-type": "application/json",
    "cache-control": "no-store",
  };
  const json = (route, data, status = 200) =>
    route.fulfill({ status, headers, body: JSON.stringify(data) });
  const execution = (route, data, status = 200) =>
    json(route, {
      $id: "mock-upload-execution",
      status: "completed",
      responseStatusCode: status,
      responseBody: JSON.stringify(
        status >= 400
          ? {
              error:
                status === 409
                  ? "Circle changed while reading. Try again."
                  : "Mock snapshot failure",
              code: status === 409 ? "conflict" : "mock_failure",
            }
          : { data },
      ),
    });
  function snapshot() {
    const copy = clone(state);
    copy.currentUserId = actor.id;
    if (!copy.users.some((u) => u.id === actor.id))
      copy.users.push(clone(actor));
    if (
      !copy.members.some(
        (m) => m.userId === actor.id && m.circleId === "family",
      )
    ) {
      copy.circles = [];
      copy.members = [];
      copy.posts = [];
      copy.comments = [];
      copy.messages = [];
    }
    for (const p of copy.posts) {
      if (p.media?.startsWith("awfile:")) p.media = fileUrl(p.media.slice(7));
      for (const a of p.attachments || [])
        if (a.uri.startsWith("awfile:")) a.uri = fileUrl(a.uri.slice(7));
    }
    return copy;
  }
  await h.context.route(`${endpoint}/v1/account**`, async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (req.method() === "OPTIONS") return json(route, {}, 204);
    if (
      url.pathname === "/v1/account/sessions/current" &&
      req.method() === "DELETE"
    ) {
      authenticated = false;
      return route.fulfill({ status: 204, headers });
    }
    if (url.pathname !== "/v1/account" || req.method() !== "GET")
      return route.fallback();
    counts.account++;
    return authenticated
      ? json(route, {
          $id: actor.id,
          name: actor.name,
          email: actor.email,
          status: true,
        })
      : json(
          route,
          { code: 401, type: "user_unauthorized", message: "Mock signed out" },
          401,
        );
  });
  await h.context.route(
    `${endpoint}/v1/functions/circle-api/executions`,
    async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return json(route, {}, 204);
      const input = JSON.parse(req.postDataJSON().body);
      if (input.kind === "snapshot") {
        counts.snapshot++;
        const status = failures.shift() || failureStatus || 200;
        events.push({ kind: "snapshot", status });
        return execution(route, snapshot(), status);
      }
      if (input.kind === "mediaCapabilities")
        return execution(route, { maxPostPhotos: 10 });
      if (input.kind === "beginUpload") {
        const id = `mockupload${++counts.begin}`;
        reservations.set(id, { id, finished: false });
        events.push({ kind: "begin", id });
        return execution(route, { ok: true, id });
      }
      if (input.kind === "finishUpload") {
        counts.finish++;
        reservations.get(input.fileId).finished = true;
        events.push({ kind: "finish", id: input.fileId });
        return execution(route, { ok: true });
      }
      if (input.kind === "cancelUpload") {
        counts.cancel++;
        return execution(route, { ok: true });
      }
      if (input.kind === "action" && input.action.type === "createPost") {
        const action = clone(input.action);
        const attachments = action.input.attachments || [
          { uri: action.input.media, type: action.input.mediaType },
        ];
        assert.ok(attachments.length >= 2 && attachments.length <= 10);
        assert.ok(
          attachments.every((a) => reservations.get(a.uri.slice(7))?.finished),
        );
        counts.post++;
        actions.push(action);
        state.posts.unshift({
          ...action.input,
          id: `album-${counts.post}`,
          authorId: actor.id,
          createdAt: new Date().toISOString(),
          reactions: [],
        });
        events.push({ kind: "post", count: attachments.length });
        if (failAfterPost) failureStatus = 500;
        return execution(route, { ok: true, id: `album-${counts.post}` });
      }
      return route.fallback();
    },
  );
  await h.context.route(
    `${endpoint}/v1/storage/buckets/circle-media/files`,
    async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return json(route, {}, 204);
      if (req.method() !== "POST") return route.fallback();
      const data = req.postDataBuffer().toString("latin1");
      const id = data.match(/name="fileId"\r\n\r\n([^\r\n]+)/)?.[1];
      assert.ok(
        reservations.has(id),
        "storage write needs its explicit mock reservation",
      );
      assert.ok(
        data.includes('read("user:alex")') &&
          data.includes('delete("user:alex")'),
      );
      assert.ok(!data.includes('read("any")'));
      counts.storage++;
      uploads.push(id);
      events.push({ kind: "storage", id });
      if (counts.storage === 2) {
        second.start();
        if (holdSecond) await second.promise;
        if (closed) return;
        if (failSecond)
          return json(
            route,
            {
              code: 403,
              type: "mock_upload_denied",
              message: "Mock second upload failed",
            },
            403,
          );
      }
      const range = req
        .headers()
        ["content-range"].match(/bytes (\d+)-(\d+)\/(\d+)/);
      const size = Number(range[3]);
      try {
        return await json(route, {
          $id: id,
          sizeOriginal: size,
          chunksUploaded: 1,
          chunksTotal: 1,
        });
      } catch (error) {
        if (!closed && !/canceled|closed|intercepted/i.test(String(error)))
          throw error;
      }
    },
  );
  await h.page.goto(`${base}/create?circleId=family`);
  await expect(
    h.page.getByRole("textbox", { name: "Memory text", exact: true }),
  ).toBeVisible();
  return {
    ...h,
    state,
    counts,
    events,
    actions,
    uploads,
    second,
    failSnapshots: (statuses, fallback = 0) => {
      failures = [...statuses];
      failureStatus = fallback;
    },
    switchAccount: (sharedCircle = false) => {
      actor = {
        id: "other-account",
        name: "Other account",
        username: "other",
        email: "other@example.test",
        avatar: "",
        bio: "",
      };
      if (sharedCircle)
        state.members.push({
          circleId: "family",
          userId: actor.id,
          role: "member",
          joinedAt: new Date().toISOString(),
        });
    },
    returnAccount: () => {
      actor = state.users.find((u) => u.id === "alex");
      authenticated = true;
    },
    revoke: () => {
      state.members = state.members.filter((m) => m.userId !== "alex");
    },
    finish: async (name, details = {}) => {
      assert.equal(
        state.posts.filter((p) => p.id === "existing-photo").length,
        1,
      );
      const storage = await h.page.evaluate(() => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
      }));
      assert.deepEqual(storage, { local: [], session: [] });
      closed = true;
      second.release();
      const result = { name, counts, events, actions, ...details };
      await h.finish(name, { album: result });
      const idx = reports.findIndex((r) => r.name === name);
      if (idx < 0) reports.push(result);
      else reports[idx] = result;
      fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2));
      console.log(`PASS ${name}`);
    },
  };
}
async function choose(h, count = 2) {
  await h.page
    .getByRole("textbox", { name: "Memory text", exact: true })
    .fill("Private album draft retained");
  const chooser = h.page.waitForEvent("filechooser");
  await h.page.getByRole("button", { name: "Photo", exact: true }).click();
  const names = [
    "forest.jpg",
    "coast.jpg",
    "camping.jpg",
    "library.jpg",
    "neighborhood.jpg",
    "avatar-alex.jpg",
    "avatar-ben.jpg",
    "avatar-daniel.jpg",
    "avatar-james.jpg",
    "avatar-maya.jpg",
  ];
  await (
    await chooser
  ).setFiles(
    Array.from({ length: count }, (_, i) => ({
      name: `photo-${i + 1}.jpg`,
      mimeType: "image/jpeg",
      buffer: fs.readFileSync(
        require.resolve(`../../assets/photos/${names[i % names.length]}`),
      ),
    })),
  );
  await expect(
    h.page.getByText(`${count} of 10 photos`, { exact: true }),
  ).toBeVisible();
  await expect(
    h.page.getByRole("button", { name: "Add memory", exact: true }),
  ).toBeEnabled();
  // Move the second photo to the front; preservation must include order and focus.
  await h.page
    .getByRole("button", { name: "Select photo 2", exact: true })
    .click();
  await h.page
    .getByRole("button", { name: "Move photo earlier", exact: true })
    .click();
  await expect.poll(async () => (await thumbnails(h.page)).length).toBe(count);
  await expect
    .poll(() =>
      h.page
        .locator('[aria-label^="Photo "][aria-label$=" thumbnail"] img')
        .evaluateAll((els) =>
          els.every((el) => el.naturalWidth > 0 && el.naturalHeight > 0),
        ),
    )
    .toBe(true);
  h.chosenDimensions = await h.page
    .locator('[aria-label^="Photo "][aria-label$=" thumbnail"] img')
    .evaluateAll((els) =>
      els.map((el) => ({ width: el.naturalWidth, height: el.naturalHeight })),
    );
  return thumbnails(h.page);
}
async function thumbnails(page) {
  return page
    .locator('[aria-label^="Photo "][aria-label$=" thumbnail"] img')
    .evaluateAll((els) => els.map((el) => el.src));
}
async function assertDraft(h, before) {
  await expect(
    h.page.getByRole("textbox", { name: "Memory text", exact: true }),
  ).toHaveValue("Private album draft retained");
  await expect(
    h.page.getByText(`${before.length} of 10 photos`, { exact: true }),
  ).toBeVisible();
  assert.deepEqual(await thumbnails(h.page), before);
  await expect(
    h.page.getByText("Photo 1 of 2 · Cover photo", { exact: true }),
  ).toBeVisible();
}
async function startSecond(h) {
  await h.page.getByRole("button", { name: "Add memory", exact: true }).click();
  await h.second.started;
}
async function settleCanceledUpload(h) {
  h.second.release();
  await expect.poll(() => h.counts.cancel).toBeGreaterThan(0);
  // The upload action always rechecks its snapshot after cancellation. Keep the
  // mocked outage active until that read has finished, rather than racing it
  // against Playwright's subsequent manual reconnect click.
  await delay(450);
}
async function recovery(h) {
  await expect(
    h.page.getByText("Reconnect to Circle", { exact: true }),
  ).toBeVisible();
  await expect(
    h.page.getByRole("textbox", { name: "Memory text", exact: true }),
  ).toHaveCount(0);
}
(async () => {
  const browser = await launchBrowser();
  try {
    const cases =
      mode === "baseline"
        ? [
            [
              "baseline snapshot409 during photo2 forces reconnect and loses draft",
              async () => {
                const h = await scenario(browser, { holdSecond: true });
                await choose(h);
                await startSecond(h);
                h.failSnapshots([409], 500);
                await h.refresh();
                await recovery(h);
                await settleCanceledUpload(h);
                h.failSnapshots([]);
                await h.page
                  .getByRole("button", { name: "Try again", exact: true })
                  .click();
                await expect(
                  h.page.getByRole("textbox", {
                    name: "Memory text",
                    exact: true,
                  }),
                ).toHaveValue("");
                await expect(
                  h.page.getByText("2 of 10 photos", { exact: true }),
                ).toHaveCount(0);
                assert.equal(h.counts.post, 0);
                await h.page.screenshot({
                  path: path.join(output, "baseline-lost-draft.png"),
                });
                await h.finish(
                  "baseline snapshot409 during photo2 forces reconnect and loses draft",
                );
              },
            ],
          ]
        : [
            ...[2, 10].map((count) => [
              `${count} photo album finishes once with full ordered attachments`,
              async () => {
                const h = await scenario(browser);
                await choose(h, count);
                await h.page
                  .getByRole("button", { name: "Add memory", exact: true })
                  .click();
                await expect(h.page).toHaveURL(/\/post\/album-1$/);
                assert.equal(h.counts.post, 1);
                assert.equal(h.counts.finish, count);
                assert.equal(h.actions[0].input.attachments.length, count);
                assert.deepEqual(
                  h.actions[0].input.attachments.map(({ width, height }) => ({
                    width,
                    height,
                  })),
                  h.chosenDimensions,
                  "post attachment order must match the reordered chooser thumbnails",
                );
                assert.deepEqual(
                  h.actions[0].input.attachments.map((a) => a.uri),
                  h.uploads.map((id) => `awfile:${id}`),
                  "post references match finished upload order",
                );
                assert.equal(
                  new Set(h.actions[0].input.attachments.map((a) => a.uri))
                    .size,
                  count,
                );
                await h.finish(
                  `${count} photo album finishes once with full ordered attachments`,
                );
              },
            ]),
            [
              "one conflicted snapshot during photo2 recovers without interrupting album",
              async () => {
                const h = await scenario(browser, { holdSecond: true });
                await choose(h);
                await startSecond(h);
                h.failSnapshots([409]);
                const before = h.counts.snapshot;
                await h.refresh();
                await expect
                  .poll(() => h.counts.snapshot)
                  .toBeGreaterThan(before + 1);
                await expect(
                  h.page.getByText("Reconnect to Circle", { exact: true }),
                ).toHaveCount(0);
                h.second.release();
                await expect(h.page).toHaveURL(/\/post\/album-1$/);
                assert.equal(h.counts.post, 1);
                assert.equal(h.actions[0].input.attachments.length, 2);
                await h.finish(
                  "one conflicted snapshot during photo2 recovers without interrupting album",
                );
              },
            ],
            ...[[500], [409, 409, 409]].map((statuses) => [
              `${statuses[0] === 500 ? "snapshot500" : "exhausted409"} recovery restores caption and ordered photos without automatic post`,
              async () => {
                const h = await scenario(browser, { holdSecond: true });
                const before = await choose(h);
                await startSecond(h);
                h.failSnapshots(statuses, statuses[0]);
                await h.refresh();
                await recovery(h);
                await settleCanceledUpload(h);
                h.failSnapshots([]);
                await h.page
                  .getByRole("button", { name: "Try again", exact: true })
                  .click();
                await assertDraft(h, before);
                await delay(150);
                assert.equal(h.counts.post, 0);
                await h.page.screenshot({
                  path: path.join(output, `restored-${statuses[0]}.png`),
                });
                await h.finish(
                  `${statuses[0] === 500 ? "snapshot500" : "exhausted409"} recovery restores caption and ordered photos without automatic post`,
                );
              },
            ]),
            [
              "second upload failure preserves draft without partial post",
              async () => {
                const h = await scenario(browser, { failSecond: true });
                const before = await choose(h);
                await startSecond(h);
                await expect(
                  h.page.getByRole("button", {
                    name: "Add memory",
                    exact: true,
                  }),
                ).toBeEnabled();
                await assertDraft(h, before);
                assert.equal(h.counts.post, 0);
                assert.equal(h.counts.finish, 1);
                await h.finish(
                  "second upload failure preserves draft without partial post",
                );
              },
            ],

            [
              "changing target Circle before reconnect preserves selected target",
              async () => {
                const h = await scenario(browser, {
                  holdSecond: true,
                  secondCircle: true,
                });
                await h.page
                  .getByRole("button", { name: /Trip Circle/ })
                  .click();
                const before = await choose(h);
                await startSecond(h);
                h.failSnapshots([500], 500);
                await h.refresh();
                await recovery(h);
                await settleCanceledUpload(h);
                h.failSnapshots([]);
                await h.page
                  .getByRole("button", { name: "Try again", exact: true })
                  .click();
                await assertDraft(h, before);
                await expect(
                  h.page.getByText(
                    "Just Trip Circle. A shared memory for your people.",
                    { exact: true },
                  ),
                ).toBeVisible();
                assert.equal(h.counts.post, 0);
                await h.finish(
                  "changing target Circle before reconnect preserves selected target",
                );
              },
            ],
            [
              "post succeeds before refresh500 and posted draft is not restored",
              async () => {
                const h = await scenario(browser, { failAfterPost: true });
                await choose(h);
                await h.page
                  .getByRole("button", { name: "Add memory", exact: true })
                  .click();
                await recovery(h);
                assert.equal(h.counts.post, 1);
                h.failSnapshots([]);
                await h.page
                  .getByRole("button", { name: "Try again", exact: true })
                  .click();
                // A confirmed post may already have navigated before React
                // renders recovery. Reopen the composer explicitly to prove the
                // submitted draft was cleared, independent of that route timing.
                await h.page
                  .getByRole("link", { name: "Add memory", exact: true })
                  .click();
                await expect(
                  h.page.getByRole("textbox", {
                    name: "Memory text",
                    exact: true,
                  }),
                ).toHaveValue("");
                assert.equal((await thumbnails(h.page)).length, 0);
                assert.equal(h.counts.post, 1);
                await h.finish(
                  "post succeeds before refresh500 and posted draft is not restored",
                );
              },
            ],
            [
              "different account in same Circle never sees old account draft",
              async () => {
                const h = await scenario(browser, { holdSecond: true });
                await choose(h);
                await startSecond(h);
                h.failSnapshots([500], 500);
                await h.refresh();
                await recovery(h);
                await settleCanceledUpload(h);
                h.failSnapshots([]);
                h.switchAccount(true);
                await h.page
                  .getByRole("button", { name: "Try again", exact: true })
                  .click();
                await expect(
                  h.page.getByRole("textbox", {
                    name: "Memory text",
                    exact: true,
                  }),
                ).toHaveValue("");
                assert.equal((await thumbnails(h.page)).length, 0);
                h.returnAccount();
                await h.refresh();
                await expect(
                  h.page.getByRole("textbox", {
                    name: "Memory text",
                    exact: true,
                  }),
                ).toHaveValue("");
                assert.equal((await thumbnails(h.page)).length, 0);
                assert.equal(h.counts.post, 0);
                await h.finish(
                  "different account in same Circle never sees old account draft",
                );
              },
            ],
            ...[320, 390].map((width) => [
              `Home and Highlights put Circles and memories first ${width}`,
              async () => {
                const h = await scenario(browser, { width });
                await h.page
                  .getByRole("link", { name: "Home", exact: true })
                  .click();
                await expect(h.page.getByTestId("home-circles")).toBeVisible();
                await expect(h.page.getByTestId("home-feed")).toBeVisible();
                await expect(
                  h.page.getByText("A little life together.", { exact: true }),
                ).toHaveCount(0);
                await expect(
                  h.page.getByTestId("home-feed-options"),
                ).toHaveCount(0);
                const circleBox = await h.page
                    .getByTestId("home-circles")
                    .boundingBox(),
                  feedBox = await h.page.getByTestId("home-feed").boundingBox();
                assert.ok(circleBox.y < feedBox.y);
                assert.ok(
                  circleBox.y < 150,
                  "Your Circles is the first content section",
                );
                await h.page
                  .getByRole("button", { name: "Feed options", exact: true })
                  .click();
                await expect(
                  h.page.getByTestId("home-feed-options"),
                ).toBeVisible();
                await h.page
                  .getByRole("button", { name: "Feed options", exact: true })
                  .click();
                await h.page.screenshot({
                  path: path.join(output, `home-${width}.png`),
                });
                await h.page.goto(`${base}/circle/family`);
                await h.page
                  .getByRole("tab", { name: "Highlights", exact: true })
                  .click();
                await expect(
                  h.page.getByRole("button", {
                    name: "Play Highlights montage",
                    exact: true,
                  }),
                ).toBeVisible();
                const beforeInfo = await h.page.evaluate(() => {
                  const a = document.querySelector(
                      '[data-testid="highlights-content"]',
                    ),
                    b = document.querySelector(
                      '[data-testid="highlights-info"]',
                    );
                  return Boolean(
                    a.compareDocumentPosition(b) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
                  );
                });
                assert.ok(
                  beforeInfo,
                  "montage precedes information in source order",
                );
                await h.page
                  .getByRole("button", {
                    name: "Play Highlights montage",
                    exact: true,
                  })
                  .click();
                await expect(
                  h.page.getByRole("button", {
                    name: "Close Highlights",
                    exact: true,
                  }),
                ).toBeVisible();
                await h.page
                  .getByRole("button", {
                    name: "Close Highlights",
                    exact: true,
                  })
                  .click();
                await h.page.screenshot({
                  path: path.join(output, `highlights-${width}.png`),
                });
                const overflow = await h.page.evaluate(
                  () => document.documentElement.scrollWidth > innerWidth,
                );
                assert.equal(overflow, false);
                assert.equal(h.counts.post, 0);
                await h.finish(
                  `Home and Highlights put Circles and memories first ${width}`,
                );
              },
            ]),
            ...["account change", "membership revoked", "explicit signout"].map(
              (kind) => [
                `${kind} prevents private draft restoration`,
                async () => {
                  const h = await scenario(browser, { holdSecond: true });
                  await choose(h);
                  await startSecond(h);
                  h.failSnapshots([500], 500);
                  await h.refresh();
                  await recovery(h);
                  await settleCanceledUpload(h);
                  h.failSnapshots([]);
                  if (kind === "account change") h.switchAccount();
                  if (kind === "membership revoked") h.revoke();
                  if (kind === "explicit signout") {
                    await h.page
                      .getByRole("button", {
                        name: "Sign out on this device",
                        exact: true,
                      })
                      .click();
                    await expect(
                      h.page.getByRole("button", {
                        name: "Get started",
                        exact: true,
                      }),
                    ).toBeVisible();
                  } else {
                    await h.page
                      .getByRole("button", { name: "Try again", exact: true })
                      .click();
                    await expect(
                      h.page.getByText("Find your people first", {
                        exact: true,
                      }),
                    ).toBeVisible();
                  }
                  await expect(
                    h.page.getByText("Private album draft retained", {
                      exact: true,
                    }),
                  ).toHaveCount(0);
                  assert.equal(
                    await thumbnails(h.page).then((a) => a.length),
                    0,
                  );
                  assert.equal(h.counts.post, 0);
                  await h.finish(`${kind} prevents private draft restoration`);
                },
              ],
            ),
          ];
    for (const [name, run] of cases)
      if (!filter || filter.test(name)) await run();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
