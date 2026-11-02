#!/usr/bin/env node
const {
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
} = require("./helpers.cjs");

assert.ok(
  process.env.CIRCLE_EXPECT_FIXED === undefined ||
    ["0", "1"].includes(process.env.CIRCLE_EXPECT_FIXED),
  "CIRCLE_EXPECT_FIXED must be 0 or 1.",
);
const expectFixed = process.env.CIRCLE_EXPECT_FIXED !== "0";

async function loadedAspect(image) {
  return image.evaluate((el) => {
    for (let node = el; node; node = node.parentElement) {
      const aspect = getComputedStyle(node).aspectRatio;
      if (aspect !== "auto") {
        const [numerator, denominator = 1] = aspect.split("/").map(Number);
        if (Number.isFinite(numerator) && denominator > 0)
          return numerator / denominator;
      }
    }
    return null;
  });
}

(async () => {
  const mode = process.argv[2] || "all";
  assert.ok(
    ["perf", "regressions", "all"].includes(mode) && process.argv.length <= 3,
    "Usage: node e2e/performance/smoke.cjs [perf|regressions|all]",
  );
  const filter = process.env.CIRCLE_CASE
    ? new RegExp(process.env.CIRCLE_CASE)
    : null;
  const browser = await launchBrowser();
  try {
    const perfCases = [
      [
        "vertical scroll vs idle signed-token polling",
        async () => {
          const h = await fixture(browser, { width: 390, posts: 12 }),
            initialLoadMs = await ready(h),
            initial = await h.metrics();
          await verticalScroll(h.page, 1);
          const afterFirstVisitScroll = await h.metrics();
          await verticalScroll(h.page, 4);
          const afterVerticalScroll = await h.metrics();
          await delay(31000);
          const afterIdlePolling = await h.metrics();
          if (expectFixed) {
            assert.equal(
              afterVerticalScroll.photoRequests,
              afterFirstVisitScroll.photoRequests,
              "repeat vertical scroll must not reload visited photos",
            );
            assert.equal(
              afterIdlePolling.photoRequests,
              afterVerticalScroll.photoRequests,
              "token refresh must not reload mounted photos",
            );
          }
          assert.ok(
            afterIdlePolling.counts.snapshot >= 4,
            "10s membership snapshots must continue",
          );
          await h.page
            .getByText("Mock scrapbook memory 7")
            .last()
            .scrollIntoViewIfNeeded();
          await delay(250);
          const afterDelayedFirstVisit = await h.metrics();
          {
            const latest = h.images
              .filter((i) => i.id === "photo6item0")
              .at(-1);
            assert.ok(
              latest && latest.token.includes(`_${h.counts.snapshot}_`),
              "first activation after token rotation must use latest authorized URL",
            );
          }
          await h.page.screenshot({
            path: `${output}/${label}-scroll-phone.png`,
          });
          const r = await h.finish(
            "vertical scroll vs idle signed-token polling",
            {
              initialLoadMs,
              initial,
              afterFirstVisitScroll,
              afterVerticalScroll,
              afterIdlePolling,
              afterDelayedFirstVisit,
            },
          );
          console.log(
            JSON.stringify({
              case: r.name,
              label,
              initial: initial.imageRequests,
              afterScroll: afterVerticalScroll.imageRequests,
              afterPolling: afterIdlePolling.imageRequests,
              polls: h.counts.snapshot,
            }),
          );
        },
      ],
      [
        "returning to already seen album photos with unchanged URLs",
        async () => {
          const h = await fixture(browser, {
              width: 1440,
              posts: 12,
              stableTokens: true,
            }),
            initialLoadMs = await ready(h),
            initial = await h.metrics();
          for (let i = 0; i < 3; i++)
            await h.page
              .getByRole("button", { name: "Next photo", exact: true })
              .first()
              .click();
          await delay(200);
          const afterAlbumAdvance = await h.metrics();
          for (let i = 0; i < 3; i++)
            await h.page
              .getByRole("button", { name: "Previous photo", exact: true })
              .first()
              .click();
          await delay(200);
          const afterAlbumReturn = await h.metrics();
          if (expectFixed)
            assert.equal(
              afterAlbumReturn.dom.removed,
              afterAlbumAdvance.dom.removed,
              "returning to visited album photos must not replace image nodes",
            );
          await h.page.screenshot({
            path: `${output}/${label}-album-desktop.png`,
          });
          const r = await h.finish(
            "returning to already seen album photos with unchanged URLs",
            { initialLoadMs, initial, afterAlbumAdvance, afterAlbumReturn },
          );
          console.log(
            JSON.stringify({
              case: r.name,
              label,
              initial: initial.photoRequests,
              advance: afterAlbumAdvance.photoRequests,
              return: afterAlbumReturn.photoRequests,
            }),
          );
        },
      ],
      [
        "membership revocation removes private journal cover and blocks further scroll loads",
        async () => {
          const h = await fixture(browser, { width: 390, posts: 3 }),
            initialLoadMs = await ready(h);
          h.revoke();
          await h.refresh();
          await expect(
            h.page.getByRole("tab", { name: "Memories", exact: true }),
          ).toHaveCount(0);
          await expect(h.page.getByTestId("circle-cover-image")).toHaveCount(0);
          await expect(
            h.page.getByText("A private little space", { exact: true }),
          ).toBeVisible();
          const imageCount = h.images.length;
          await verticalScroll(h.page);
          assert.equal(h.images.length, imageCount);
          await h.finish(
            "membership revocation removes private journal cover and blocks further scroll loads",
            { initialLoadMs },
          );
        },
      ],
      ...[500, 401].map((status) => [
        `account ${status} removes private UI`,
        async () => {
          const h = await fixture(browser, { width: 390, posts: 3 }),
            initialLoadMs = await ready(h);
          h.accountFail(status);
          await h.refresh();
          await expect(
            h.page.getByRole("tab", { name: "Memories", exact: true }),
          ).toHaveCount(0);
          await expect(h.page.getByTestId("circle-cover-image")).toHaveCount(0);
          if (status === 500)
            await expect(
              h.page.getByText("Reconnect to Circle", { exact: true }),
            ).toBeVisible();
          else
            await expect(
              h.page.getByRole("button", { name: "Get started", exact: true }),
            ).toBeVisible();
          await h.finish(`account ${status} removes private UI`, {
            initialLoadMs,
          });
        },
      ]),
      [
        "cold start with controlled five-hundred-ms font latency",
        async () => {
          const h = await fixture(browser, {
              width: 390,
              posts: 3,
              fontLatency: 500,
            }),
            initialLoadMs = await ready(h);
          const fonts = h.events.filter((e) => e.kind === "font"),
            account = h.events.find((e) => e.kind === "account");
          assert.ok(fonts.length >= 5);
          const firstFontStart = Math.min(...fonts.map((e) => e.start)),
            lastFontEnd = Math.max(...fonts.map((e) => e.end || 0));
          const accountStartRelativeToFontEnd = account.start - lastFontEnd;
          if (expectFixed)
            assert.ok(
              accountStartRelativeToFontEnd < 0,
              "account request should overlap delayed fonts",
            );
          await h.finish(
            "cold start with controlled five-hundred-ms font latency",
            {
              initialLoadMs,
              firstFontStart,
              lastFontEnd,
              accountStartRelativeToFontEnd,
            },
          );
        },
      ],
      [
        "one foreground event without access change",
        async () => {
          const h = await fixture(browser, { width: 390, posts: 3 }),
            initialLoadMs = await ready(h),
            initial = await h.metrics();
          await h.refresh();
          await delay(600);
          const afterForeground = await h.metrics();
          if (expectFixed) {
            assert.equal(
              afterForeground.counts.account - initial.counts.account,
              1,
            );
            assert.equal(
              afterForeground.counts.snapshot - initial.counts.snapshot,
              1,
            );
            assert.equal(
              afterForeground.counts.wallpaper - initial.counts.wallpaper,
              1,
            );
          }
          await h.finish("one foreground event without access change", {
            initialLoadMs,
            initial,
            afterForeground,
          });
        },
      ],
      [
        "slow eleven-second feature response crosses ten-second polling interval",
        async () => {
          const h = await fixture(browser, {
              width: 390,
              posts: 3,
              featureLatency: 11000,
            }),
            initialLoadMs = await ready(h),
            initial = await h.metrics();
          await delay(12000);
          const afterSlowFeatureResponse = await h.metrics();
          const featureEvents = h.events.filter((e) => e.kind === "features");
          const maxConcurrentFeatures = Math.max(
            0,
            ...featureEvents.map(
              (e) =>
                featureEvents.filter(
                  (other) =>
                    other.start <= e.start &&
                    (!other.end || other.end > e.start),
                ).length,
            ),
          );
          if (expectFixed) {
            assert.equal(
              maxConcurrentFeatures,
              1,
              "slow features should coalesce",
            );
            assert.ok(
              afterSlowFeatureResponse.counts.wallpaper >= 1,
              "first slow feature response must apply, not starve",
            );
          }
          await h.finish(
            "slow eleven-second feature response crosses ten-second polling interval",
            {
              initialLoadMs,
              initial,
              afterSlowFeatureResponse,
              maxConcurrentFeatures,
            },
          );
        },
      ],
    ];
    const regressionCases = [
      [
        "wallpaper403 clears prior pattern with membership retained",
        async () => {
          const h = await fixture(browser, { width: 390, posts: 3 });
          await ready(h);
          await expect(
            h.page.getByTestId("circle-wallpaper-frame"),
          ).toBeVisible();
          h.wallpaperFail(403);
          await h.refresh();
          await expect(
            h.page.getByTestId("circle-wallpaper-frame"),
          ).toHaveCount(0);
          await expect(
            h.page.getByRole("tab", { name: "Memories", exact: true }),
          ).toBeVisible();
          assert.equal(
            await h.page
              .locator("img")
              .evaluateAll(
                (els) =>
                  els.filter((el) => el.src.includes("/files/wp_")).length,
              ),
            0,
          );
          await h.finish(
            "wallpaper403 clears prior pattern with membership retained",
          );
        },
      ],
      [
        "verified account switch clears prior membership media",
        async () => {
          const h = await fixture(browser, { width: 390, posts: 3 });
          await ready(h);
          h.switchAccount();
          await h.refresh();
          await expect(
            h.page.getByRole("tab", { name: "Memories", exact: true }),
          ).toHaveCount(0);
          await expect(h.page.getByTestId("circle-cover-image")).toHaveCount(0);
          await expect(
            h.page.getByText("A private little space", { exact: true }),
          ).toBeVisible();
          assert.equal(
            await h.page
              .locator("img")
              .evaluateAll(
                (els) =>
                  els.filter((el) =>
                    /\/files\/(photo|coverfamily)/.test(el.src),
                  ).length,
              ),
            0,
          );
          await h.finish(
            "verified account switch clears prior membership media",
          );
        },
      ],
      [
        "failed image recovers once from new authorized URL",
        async () => {
          const h = await fixture(browser, {
            width: 390,
            posts: 3,
            failInitialPhoto: true,
          });
          await h.page.goto(base + "/circle/family");
          await expect(
            h.page.getByText("This photo couldn’t load.", { exact: true }),
          ).toBeVisible();
          const afterFailure = await h.metrics();
          await delay(400);
          assert.equal(
            (await h.metrics()).photoRequests,
            afterFailure.photoRequests,
            "same failed URL must not auto-loop",
          );
          await h.refresh();
          await h.page.waitForFunction(
            () =>
              !document.body.textContent.includes(
                "This photo couldn’t load.",
              ) && !document.body.textContent.includes("Loading photo…"),
          );
          const successes = h.images.filter(
            (i) => i.id === "photo0item0" && !i.denied,
          );
          assert.equal(successes.length, 1);
          assert.ok(successes[0].token.includes("_2_"));
          await h.finish("failed image recovers once from new authorized URL", {
            afterFailure,
          });
        },
      ],
      [
        "manual retry uses latest current URL after transient failure",
        async () => {
          const h = await fixture(browser, {
            width: 390,
            posts: 3,
            failAllPhoto: true,
          });
          await h.page.goto(base + "/circle/family");
          await expect(
            h.page.getByText("This photo couldn’t load.", { exact: true }),
          ).toBeVisible();
          await h.refresh();
          await expect
            .poll(() =>
              h.images.some(
                (i) =>
                  i.id === "photo0item0" && i.denied && i.token.includes("_2_"),
              ),
            )
            .toBe(true);
          await expect(
            h.page.getByText("This photo couldn’t load.", { exact: true }),
          ).toBeVisible();
          h.setPhotoFailure(false);
          await h.page
            .getByRole("button", { name: "Retry photo", exact: true })
            .click();
          await h.page.waitForFunction(
            () =>
              !document.body.textContent.includes(
                "This photo couldn’t load.",
              ) && !document.body.textContent.includes("Loading photo…"),
          );
          const successes = h.images.filter(
            (i) => i.id === "photo0item0" && !i.denied,
          );
          assert.equal(successes.length, 1);
          assert.ok(successes[0].token.includes("_2_"));
          await h.finish(
            "manual retry uses latest current URL after transient failure",
          );
        },
      ],
      [
        "fresh viewer uses current URL when old token is expired",
        async () => {
          const h = await fixture(browser, { width: 390, posts: 3 });
          await ready(h);
          h.expireCurrentUrls();
          await h.refresh();
          await delay(200);
          const beforeViewer = await h.metrics();
          await h.page
            .getByRole("button", {
              name: "Open photo full screen",
              exact: true,
            })
            .first()
            .click();
          await expect(h.page.getByRole("dialog")).toBeVisible();
          await expect(
            h.page.getByRole("button", {
              name: "Close media viewer",
              exact: true,
            }),
          ).toBeVisible();
          await delay(200);
          const requests = h.images.filter((i) => i.id === "photo0item0");
          assert.ok(requests.at(-1).token.includes("_2_"));
          assert.equal(
            requests.some((i) => i.denied),
            false,
            "new viewer must not request old expired token",
          );
          const sources = await h.page
            .getByRole("dialog")
            .locator("img")
            .evaluateAll((els) => els.map((el) => el.src));
          assert.ok(
            sources.some((src) => src.includes("mock_private_2_photo0item0")),
          );
          await h.finish(
            "fresh viewer uses current URL when old token is expired",
            {
              beforeViewer,
              expirySimulation:
                "fixture rejects old token versions with403; no real60s wall-clock wait",
            },
          );
        },
      ],
      [
        "real file replacement reloads new resource identity",
        async () => {
          const h = await fixture(browser, { width: 390, posts: 3 });
          await ready(h);
          h.replacePhoto();
          await h.refresh();
          await delay(250);
          assert.ok(h.images.some((i) => i.id === "photoReplacement0"));
          const sources = await h.page
            .locator("img")
            .evaluateAll((els) => els.map((el) => el.src));
          assert.ok(
            sources.some((src) => src.includes("/files/photoReplacement0/")),
          );
          assert.ok(
            !sources.some((src) => src.includes("/files/photo0item0/")),
          );
          await h.finish("real file replacement reloads new resource identity");
        },
      ],
      [
        "deleted media reference disappears after authorized snapshot",
        async () => {
          const h = await fixture(browser, { width: 390, posts: 3 });
          await ready(h);
          h.deleteMedia();
          await h.refresh();
          await delay(200);
          const sources = await h.page
            .locator("img")
            .evaluateAll((els) => els.map((el) => el.src));
          assert.ok(!sources.some((src) => /\/files\/photo0item/.test(src)));
          await expect(
            h.page.getByText("Mock scrapbook memory 1").last(),
          ).toBeVisible();
          await h.finish(
            "deleted media reference disappears after authorized snapshot",
            {
              deletionSimulation:
                "server-authorized snapshot omits deleted attachment; actual Appwrite deletion not tested",
            },
          );
        },
      ],
      [
        "snapshot404 from deleted-resource failure clears private media",
        async () => {
          const h = await fixture(browser, { width: 390, posts: 3 });
          await ready(h);
          h.snapshotFail(404);
          await h.refresh();
          await expect(
            h.page.getByText("Reconnect to Circle", { exact: true }),
          ).toBeVisible();
          await expect(
            h.page.getByRole("tab", { name: "Memories", exact: true }),
          ).toHaveCount(0);
          await expect(h.page.getByTestId("circle-cover-image")).toHaveCount(0);
          await h.finish(
            "snapshot404 from deleted-resource failure clears private media",
            {
              deletionSimulation:
                "mock snapshot404 failure; not a hosted deletion request",
            },
          );
        },
      ],
      [
        "role reduction resets decoded image scope",
        async () => {
          const h = await fixture(browser, { width: 390, posts: 3 });
          await ready(h);
          const initial = await h.metrics();
          h.roleLoss();
          await h.refresh();
          await delay(250);
          await expect(h.page.getByTestId("circle-cover-change")).toHaveCount(
            0,
          );
          await expect(
            h.page.getByRole("tab", { name: "Memories", exact: true }),
          ).toBeVisible();
          const after = await h.metrics();
          assert.ok(after.dom.removed > initial.dom.removed);
          await h.finish("role reduction resets decoded image scope", {
            initial,
            after,
          });
        },
      ],
      [
        "legacy photo load event supplies natural portrait aspect",
        async () => {
          const h = await fixture(browser, {
            width: 390,
            posts: 3,
            legacyDimensions: true,
          });
          await ready(h);
          await h.page
            .getByText("Mock scrapbook memory 3")
            .last()
            .scrollIntoViewIfNeeded();
          await delay(250);
          const image = h.page.getByRole("img", {
            name: "Mock scrapbook memory 3",
            exact: true,
          });
          await expect(image).toBeVisible();
          const ratio = await loadedAspect(image);
          assert.ok(
            Math.abs(ratio - 0.78) < 0.01,
            "expected loaded600x800 aspect clamped to .78, got " + ratio,
          );
          await h.finish(
            "legacy photo load event supplies natural portrait aspect",
            { ratio },
          );
        },
      ],
      [
        "explicit mocked logout clears private media and session state",
        async () => {
          const h = await fixture(browser, { width: 390, posts: 3 });
          await ready(h);
          await h.page.goto(base + "/profile");
          await h.page
            .getByRole("button", { name: "Sign out", exact: true })
            .click();
          await expect(
            h.page.getByRole("button", { name: "Get started", exact: true }),
          ).toBeVisible();
          assert.equal(h.counts.sessionDeletes, 1);
          assert.equal(
            await h.page
              .locator("img")
              .evaluateAll(
                (els) =>
                  els.filter((el) =>
                    /\/files\/(photo|coverfamily|wp_)/.test(el.src),
                  ).length,
              ),
            0,
          );
          await h.finish(
            "explicit mocked logout clears private media and session state",
            {
              logoutSimulation:
                "one intercepted fake session DELETE; no real Appwrite mutation",
            },
          );
        },
      ],
      [
        "late captured actorA snapshot cannot overwrite verified actorB",
        async () => {
          const h = await fixture(browser, { width: 390, posts: 3 });
          await ready(h);
          const held = h.holdNextSnapshot();
          await h.refresh();
          await held.started;
          h.switchAccount();
          await h.refresh();
          await expect(
            h.page.getByText("A private little space", { exact: true }),
          ).toBeVisible();
          held.release();
          await delay(250);
          await expect(
            h.page.getByRole("tab", { name: "Memories", exact: true }),
          ).toHaveCount(0);
          await expect(h.page.getByTestId("circle-cover-image")).toHaveCount(0);
          assert.equal(
            await h.page
              .locator("img")
              .evaluateAll(
                (els) =>
                  els.filter((el) =>
                    /\/files\/(photo|coverfamily|wp_)/.test(el.src),
                  ).length,
              ),
            0,
          );
          await h.finish(
            "late captured actorA snapshot cannot overwrite verified actorB",
            {
              overlapSimulation:
                "captured actual A snapshot payload before holding; released only after B empty-membership state was visible",
            },
          );
        },
      ],
      [
        "late previous-Circle photo cannot appear in new Circle",
        async () => {
          const h = await fixture(browser, {
            width: 1440,
            posts: 3,
            holdInitialImage: true,
          });
          h.addOtherCircle();
          const held = h.heldImage();
          await h.page.goto(base + "/circle/family");
          await expect(
            h.page.getByRole("tab", { name: "Memories", exact: true }),
          ).toBeVisible();
          await held.started;
          await h.page.getByRole("link", { name: /Other Place/ }).click();
          await expect(h.page).toHaveURL(/\/circle\/other-circle$/);
          await expect(
            h.page.getByText("Other circle memory").last(),
          ).toBeVisible();
          held.release();
          await delay(250);
          await expect(
            h.page.getByText("Mock scrapbook memory 1").last(),
          ).toHaveCount(0);
          const sources = await h.page
            .locator("img")
            .evaluateAll((els) => els.map((el) => el.src));
          assert.ok(
            !sources.some((src) => src.includes("/files/photo0item0/")),
          );
          assert.ok(sources.some((src) => src.includes("/files/photo3item0/")));
          await h.finish(
            "late previous-Circle photo cannot appear in new Circle",
            {
              overlapSimulation:
                "held family photo bytes, navigated through client router to Other Place, released bytes after new Circle was visible",
            },
          );
        },
      ],
      [
        "signed media URLs are absent from local and session storage",
        async () => {
          const h = await fixture(browser, { width: 390, posts: 3 });
          await ready(h);
          await h.refresh();
          await delay(200);
          await h.page
            .getByRole("button", {
              name: "Open photo full screen",
              exact: true,
            })
            .first()
            .click();
          await expect(h.page.getByRole("dialog")).toBeVisible();
          await h.page
            .getByRole("button", { name: "Close media viewer", exact: true })
            .click();
          const storage = await h.page.evaluate(() => {
            const scan = (store) => {
              const keys = Object.keys(store);
              return {
                keys: keys.length,
                privateKeys: keys.filter((key) =>
                  /mock_private_|circle-test\.example.*storage\/buckets/.test(
                    store.getItem(key) || "",
                  ),
                ),
              };
            };
            return { local: scan(localStorage), session: scan(sessionStorage) };
          });
          assert.deepEqual(storage.local.privateKeys, []);
          assert.deepEqual(storage.session.privateKeys, []);
          await h.finish(
            "signed media URLs are absent from local and session storage",
            {
              storageAudit: storage,
              scope:
                "browser storage after signed-image rotation and modal viewing; no claim of clearing HTTP/OS caches",
            },
          );
        },
      ],
    ];
    const selected = (
      mode === "perf"
        ? perfCases
        : mode === "regressions"
          ? regressionCases
          : [...perfCases, ...regressionCases]
    ).filter(([name]) => !filter || filter.test(name));
    assert.ok(
      selected.length,
      "CIRCLE_CASE did not match any cases in the selected mode.",
    );
    let passed = 0;
    for (const [name, run] of selected) {
      console.log("RUN " + name);
      await run();
      passed++;
      console.log("PASS " + name);
    }
    console.log(
      JSON.stringify({
        label,
        mode,
        expectFixed,
        passed,
        reportedCases: reports.length,
        report: reportPath,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
