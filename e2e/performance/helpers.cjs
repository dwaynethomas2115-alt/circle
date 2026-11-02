const { chromium, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const clone = (value) => JSON.parse(JSON.stringify(value));
const original = require("./fixture.json");
const endpoint = "https://circle-test.example";

function loopbackBase(value) {
  assert.ok(value, "Set CIRCLE_SMOKE_BASE explicitly to a local HTTP origin.");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("CIRCLE_SMOKE_BASE must be a local HTTP origin.");
  }
  assert.ok(
    url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/" &&
      /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\/?$/.test(value) &&
      !/\s/.test(value),
    "CIRCLE_SMOKE_BASE must be http://127.0.0.1, http://localhost, or http://[::1], with an optional port and no userinfo, path, query, or fragment.",
  );
  return url.origin;
}
const base = loopbackBase(process.env.CIRCLE_SMOKE_BASE);
const label = process.env.CIRCLE_SMOKE_LABEL || "smoke";
assert.match(
  label,
  /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
  "CIRCLE_SMOKE_LABEL must be a simple filename label.",
);
const output = path.resolve(
  process.env.CIRCLE_SMOKE_OUTPUT ||
    path.join(os.tmpdir(), "circle-performance-smoke"),
);
const reportPath = path.join(output, `${label}-report.json`);
fs.mkdirSync(output, { recursive: true });
const reports = fs.existsSync(reportPath)
  ? JSON.parse(fs.readFileSync(reportPath, "utf8"))
  : [];
assert.ok(Array.isArray(reports), "Existing smoke report must be an array.");
const photo = fs.readFileSync(
  require.resolve("../../assets/photos/forest.jpg"),
);
const avatar = fs.readFileSync(
  require.resolve("../../assets/photos/avatar-alex.jpg"),
);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function launchBrowser() {
  const executablePath = process.env.CIRCLE_CHROMIUM_EXECUTABLE;
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
}
const fileUrl = (id, version) =>
  `${endpoint}/v1/storage/buckets/circle-media/files/${id}/view?project=circle-test&token=mock_private_${version}_${id}`;
async function fixture(
  browser,
  {
    width = 390,
    posts = 12,
    latency = 70,
    featureLatency = latency,
    fontLatency = 0,
    stableTokens = false,
    failInitialPhoto = false,
    legacyDimensions = false,
    failAllPhoto = false,
    holdInitialImage = false,
  } = {},
) {
  let closed = false;
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const app = clone(original.state),
    profile = app.users.find((u) => u.id === "alex");
  app.circles = app.circles.filter((c) => c.id === "family");
  app.members = app.members.filter((m) => m.circleId === "family");
  app.requests = [];
  app.invitations = [];
  app.messages = [];
  app.comments = [];
  app.notifications = [];
  app.reports = [];
  app.posts = Array.from({ length: posts }, (_, i) => ({
    id: `post-${i}`,
    circleId: "family",
    authorId: i % 2 ? "alex" : "sarah",
    content: `Mock scrapbook memory ${i + 1}`,
    mediaType: "image",
    createdAt: new Date(Date.now() - i * 60000).toISOString(),
    reactions: [],
    attachments: Array.from({ length: i % 3 === 2 ? 1 : 4 }, (_, j) => ({
      uri: "",
      type: "image",
      width: 1200,
      height: 900,
    })),
    media: "",
  }));
  let authenticated = true,
    revoked = false,
    snapshotVersion = 0,
    accountStatus = 200,
    snapshotStatus = 200,
    wallpaperStatus = 200,
    actor = profile;
  const fileOverrides = new Map(),
    expiredVersions = new Set();
  let snapshotHold = null,
    imageHold = null,
    originalImageHold = null;
  function hold() {
    let release, started;
    const promise = new Promise((r) => (release = r)),
      startedPromise = new Promise((r) => (started = r));
    return { promise, release, started, startedPromise };
  }
  if (holdInitialImage) imageHold = originalImageHold = hold();
  if (legacyDimensions)
    for (const post of app.posts)
      for (const a of post.attachments) {
        delete a.width;
        delete a.height;
      }
  const counts = {
    account: 0,
    snapshot: 0,
    features: 0,
    wallpaper: 0,
    images: 0,
    sessions: 0,
    sessionDeletes: 0,
    mutations: 0,
  };
  const events = [],
    images = [],
    unexpected = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__imagePerf = {
      added: 0,
      removed: 0,
      sourceChanges: 0,
      styleChanges: 0,
      loads: 0,
    };
    const isPrivate = (el) =>
      el?.nodeType === 1 &&
      ((el.tagName === "IMG" && /circle-test\.example/.test(el.src || "")) ||
        /circle-test\.example/.test(el.style?.backgroundImage || ""));
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "attributes") {
          if (r.attributeName === "src" && isPrivate(r.target))
            window.__imagePerf.sourceChanges++;
          if (
            r.attributeName === "style" &&
            isPrivate(r.target) &&
            /background-image/.test(r.target.getAttribute("style") || "")
          )
            window.__imagePerf.styleChanges++;
        } else {
          for (const n of r.addedNodes) {
            if (isPrivate(n)) window.__imagePerf.added++;
            if (n.querySelectorAll)
              for (const el of n.querySelectorAll("img"))
                if (isPrivate(el)) window.__imagePerf.added++;
          }
          for (const n of r.removedNodes) {
            if (isPrivate(n)) window.__imagePerf.removed++;
            if (n.querySelectorAll)
              for (const el of n.querySelectorAll("img"))
                if (isPrivate(el)) window.__imagePerf.removed++;
          }
        }
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src", "style"],
    });
    document.addEventListener(
      "load",
      (e) => {
        if (isPrivate(e.target)) window.__imagePerf.loads++;
      },
      true,
    );
  });
  function snapshot() {
    const state = clone(app),
      version = stableTokens ? 1 : snapshotVersion;
    if (actor.id !== profile.id)
      return {
        ...state,
        currentUserId: actor.id,
        users: [clone(actor)],
        circles: [],
        members: [],
        requests: [],
        posts: [],
        comments: [],
        messages: [],
        notifications: [],
      };
    state.users.forEach((u, i) => (u.avatar = fileUrl(`avatar${i}`, version)));
    state.circles[0].cover = fileUrl("coverfamily", version);
    for (let i = 0; i < state.posts.length; i++) {
      state.posts[i].attachments.forEach(
        (a, j) =>
          (a.uri = fileUrl(
            fileOverrides.get(`${i}:${j}`) || `photo${i}item${j}`,
            version,
          )),
      );
      if (state.posts[i].attachments.length)
        state.posts[i].media = state.posts[i].attachments[0].uri;
      else delete state.posts[i].media;
    }
    if (revoked) {
      state.members = state.members.filter((m) => m.userId !== profile.id);
      state.posts = [];
      state.comments = [];
      state.messages = [];
      state.circles = [];
    }
    return state;
  }
  await context.route("**/*", async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    if (u.origin === base) {
      if (fontLatency && /\.(ttf|woff2?)(?:$|\?)/.test(u.pathname)) {
        const event = { kind: "font", path: u.pathname, start: Date.now() };
        events.push(event);
        await delay(fontLatency);
        if (closed) return;
        page
          .waitForResponse((r) => r.url() === req.url())
          .then(() => {
            event.end = Date.now();
          })
          .catch(() => {});
        return route.continue();
      }
      return route.continue();
    }
    if (["blob:", "data:"].includes(u.protocol)) return route.continue();
    if (u.origin !== endpoint) {
      unexpected.push(req.method() + " " + u.origin + u.pathname);
      return route.abort();
    }
    const cors = {
      "access-control-allow-origin": base,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS,DELETE",
      "cache-control": "no-store",
    };
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    const json = (value, status = 200) =>
      route.fulfill({
        status,
        headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify(value),
      });
    if (
      u.pathname === "/v1/account/sessions/current" &&
      req.method() === "DELETE"
    ) {
      counts.sessionDeletes++;
      authenticated = false;
      return route.fulfill({ status: 204, headers: cors });
    }
    if (u.pathname === "/v1/account" && req.method() === "GET") {
      counts.account++;
      const event = { kind: "account", start: Date.now() };
      events.push(event);
      await delay(latency);
      event.end = Date.now();
      return accountStatus === 200 && authenticated
        ? json({
            $id: actor.id,
            name: actor.name,
            email: actor.email,
            status: true,
          })
        : json(
            {
              code: accountStatus === 200 ? 401 : accountStatus,
              type: "general_server_error",
              message: "Mock account failure",
            },
            accountStatus === 200 ? 401 : accountStatus,
          );
    }
    if (u.pathname === "/v1/functions/circle-api/executions") {
      const input = JSON.parse(req.postDataJSON().body),
        kind = input.kind;
      let data,
        status = 200;
      const event = { kind, start: Date.now() };
      events.push(event);
      if (kind === "snapshot" && snapshotHold) {
        const hold = snapshotHold;
        snapshotHold = null;
        counts.snapshot++;
        snapshotVersion++;
        const captured = snapshot();
        hold.started();
        await hold.promise;
        if (closed) return;
        event.end = Date.now();
        return json({
          $id: "mock-execution",
          status: "completed",
          responseStatusCode: 200,
          responseBody: JSON.stringify({ data: captured }),
        });
      }
      await delay(kind === "features" ? featureLatency : latency);
      event.end = Date.now();
      if (closed) return;
      if (kind === "snapshot") {
        counts.snapshot++;
        snapshotVersion++;
        if (snapshotStatus !== 200) status = snapshotStatus;
        else data = snapshot();
      } else if (kind === "features") {
        counts.features++;
        data = {
          version: 1,
          polls: [],
          votes: [],
          events: [],
          rsvps: [],
          readStates: [],
          themes:
            revoked || actor.id !== profile.id
              ? {}
              : { family: clone(original.theme) },
        };
      } else if (kind === "themeWallpaper") {
        counts.wallpaper++;
        if (revoked || actor.id !== profile.id || wallpaperStatus !== 200)
          status = wallpaperStatus !== 200 ? wallpaperStatus : 403;
        else
          data = {
            url: fileUrl(
              "wp_22222222222242228222222222222222",
              counts.wallpaper,
            ),
            expiresAt: Date.now() + 60000,
          };
      } else {
        counts.mutations++;
        unexpected.push("Unexpected execution " + kind);
        return route.abort();
      }
      return json({
        $id: "mock-execution",
        status: "completed",
        responseStatusCode: status,
        responseBody: JSON.stringify(
          status === 200 ? { data } : { error: "Mock server access failure" },
        ),
      });
    }
    if (
      u.pathname.includes("/storage/buckets/circle-media/files/") &&
      req.method() === "GET"
    ) {
      counts.images++;
      const id = u.pathname.split("/files/")[1].split("/")[0];
      const event = {
        id,
        token: u.searchParams.get("token"),
        start: Date.now(),
      };
      images.push(event);
      if (id === "photo0item0" && imageHold) {
        const hold = imageHold;
        imageHold = null;
        hold.started();
        await hold.promise;
      }
      await delay(latency);
      if (closed) return;
      event.end = Date.now();
      const version = Number(
        (event.token || "").match(/mock_private_(\d+)_/)?.[1],
      );
      if (
        expiredVersions.has(version) ||
        (((failInitialPhoto && version === 1) || failAllPhoto) &&
          id === "photo0item0")
      ) {
        event.denied = true;
        return route.fulfill({
          status: 403,
          headers: cors,
          body: "Mock expired private URL",
        });
      }
      return route.fulfill({
        status: 200,
        headers: { ...cors, "content-type": "image/jpeg" },
        body: id.startsWith("avatar") ? avatar : photo,
      });
    }
    if (u.pathname === "/mock/avatar.jpg")
      return route.fulfill({
        headers: { ...cors, "content-type": "image/jpeg" },
        body: avatar,
      });
    if (u.pathname === "/mock/photo.jpg")
      return route.fulfill({
        headers: { ...cors, "content-type": "image/jpeg" },
        body: photo,
      });
    unexpected.push(req.method() + " " + u.pathname);
    return route.abort();
  });
  const metrics = async () => ({
    counts: clone(counts),
    dom: await page.evaluate(() => window.__imagePerf),
    imageRequests: images.length,
    photoRequests: images.filter((x) => x.id.startsWith("photo")).length,
    uniquePhotoUrls: new Set(
      images
        .filter((x) => x.id.startsWith("photo"))
        .map((x) => x.id + ":" + x.token),
    ).size,
  });
  const finish = async (name, details = {}) => {
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    assert.equal(counts.sessions, 0);
    assert.equal(counts.mutations, 0);
    const report = {
      name,
      label,
      width,
      posts,
      latency,
      featureLatency,
      fontLatency,
      stableTokens,
      ...details,
      metrics: await metrics(),
      events,
      images,
      unexpected,
      errors,
    };
    const prior = reports.findIndex((r) => r.name === name);
    if (prior >= 0) reports[prior] = report;
    else reports.push(report);
    fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2));
    closed = true;
    await context.close();
    return report;
  };
  return {
    context,
    page,
    metrics,
    finish,
    counts,
    images,
    events,
    refresh: async () =>
      page.evaluate(() =>
        document.dispatchEvent(new Event("visibilitychange")),
      ),
    revoke: () => {
      revoked = true;
    },
    accountFail: (status) => {
      accountStatus = status;
    },
    snapshotFail: (status) => {
      snapshotStatus = status;
    },
    setPhotoFailure: (value) => {
      failAllPhoto = value;
    },
    deleteMedia: () => {
      app.posts[0].attachments = [];
      delete app.posts[0].media;
    },
    holdNextSnapshot: () => {
      snapshotHold = hold();
      return {
        started: snapshotHold.startedPromise,
        release: snapshotHold.release,
      };
    },
    heldImage: () =>
      originalImageHold && {
        started: originalImageHold.startedPromise,
        release: originalImageHold.release,
      },
    addOtherCircle: () => {
      app.circles.push({
        ...clone(app.circles[0]),
        id: "other-circle",
        name: "Other Place",
        cover: undefined,
      });
      app.members.push({
        circleId: "other-circle",
        userId: profile.id,
        role: "member",
        joinedAt: new Date().toISOString(),
      });
      app.posts.push({
        id: "other-post",
        circleId: "other-circle",
        authorId: profile.id,
        content: "Other circle memory",
        createdAt: new Date().toISOString(),
        reactions: [],
        mediaType: "image",
        media: "",
        attachments: [{ uri: "", type: "image", width: 600, height: 800 }],
      });
    },
    wallpaperFail: (status) => {
      wallpaperStatus = status;
    },
    expireCurrentUrls: () => {
      for (let i = 1; i <= snapshotVersion; i++) expiredVersions.add(i);
    },
    replacePhoto: () => fileOverrides.set("0:0", "photoReplacement0"),
    roleLoss: () => {
      app.members.find((m) => m.userId === profile.id).role = "member";
    },
    switchAccount: () => {
      actor = {
        id: "other-account",
        name: "Other Person",
        email: "other@example.test",
        avatar: "",
        username: "other",
        bio: "",
      };
    },
  };
}
async function ready(h, route = "/circle/family") {
  const start = Date.now();
  await h.page.goto(base + route);
  await expect(
    h.page.getByRole("tab", { name: "Memories", exact: true }),
  ).toBeVisible();
  await h.page.waitForFunction(
    () => !document.body.textContent.includes("Loading photo…"),
  );
  await delay(250);
  return Date.now() - start;
}
async function verticalScroll(page, trips = 5) {
  await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("*")).filter(
      (el) =>
        el.clientHeight > 300 &&
        el.scrollHeight > el.clientHeight + 500 &&
        ["auto", "scroll"].includes(getComputedStyle(el).overflowY),
    );
    candidates.sort(
      (a, b) =>
        b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight),
    );
    window.__perfScroll = candidates[0];
  });
  for (let i = 0; i < trips; i++) {
    await page.evaluate(() => {
      if (window.__perfScroll)
        window.__perfScroll.scrollTop = window.__perfScroll.scrollHeight;
    });
    await delay(90);
    await page.evaluate(() => {
      if (window.__perfScroll) window.__perfScroll.scrollTop = 0;
    });
    await delay(90);
  }
}

module.exports = {
  assert,
  expect,
  fixture,
  ready,
  verticalScroll,
  delay,
  base,
  label,
  output,
  reportPath,
  reports,
  launchBrowser,
  loopbackBase,
};
