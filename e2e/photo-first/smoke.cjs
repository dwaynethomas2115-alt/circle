#!/usr/bin/env node
// Local synthetic-account checks. Every non-loopback request is intercepted.
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
const summaryPath = path.join(output, `photo-first-${mode}-summary.json`);
const results = fs.existsSync(summaryPath)
  ? JSON.parse(fs.readFileSync(summaryPath, "utf8"))
  : [];
assert.ok(Array.isArray(results));
const file = (id) =>
  `${endpoint}/v1/storage/buckets/circle-media/files/${id}/view?project=circle-test&token=mock_private_1_${id}`;

async function scenario(browser, width = 390, options = {}) {
  const h = await fixture(browser, { width, posts: 3 });
  const state = clone(original.state);
  state.users.forEach((user) => (user.avatar = `${endpoint}/mock/avatar.jpg`));
  state.circles[0].cover = options.noPhoto ? undefined : file("coverfamily");
  if (options.longName)
    state.circles[0].name = "The Very Long Family Circle Name";
  state.members.find((member) => member.userId === "alex").role =
    options.role || "admin";
  state.requests = [];
  state.invitations = [];
  state.comments = [];
  state.messages = [];
  state.notifications = [];
  state.reports = [];
  state.posts = options.empty
    ? []
    : [
        "2026-03-15T12:00:00Z",
        "2026-01-01T12:00:00Z",
        "2026-01-15T12:00:00Z",
      ].map((createdAt, index) => ({
        id: `post-${index}`,
        circleId: "family",
        authorId: index % 2 ? "alex" : "sarah",
        content: `Mock scrapbook memory ${index + 1}`,
        mediaType: "image",
        media: file(`photo${index}item0`),
        createdAt,
        reactions: [],
        attachments: [
          {
            uri: file(`photo${index}item0`),
            type: "image",
            width: 1200,
            height: 900,
          },
        ],
      }));
  let reads = 0;
  await h.context.route(
    `${endpoint}/v1/functions/circle-api/executions`,
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const input = JSON.parse(route.request().postDataJSON().body);
      if (input.kind !== "snapshot") return route.fallback();
      reads++;
      return route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": base,
          "access-control-allow-credentials": "true",
          "content-type": "application/json",
          "cache-control": "no-store",
        },
        body: JSON.stringify({
          $id: "mock-execution",
          status: "completed",
          responseStatusCode: 200,
          responseBody: JSON.stringify({ data: clone(state) }),
        }),
      });
    },
  );
  await h.page.goto(`${base}/circle/family`);
  await expect(h.page.getByTestId("circle-header")).toBeVisible();
  await expect(
    h.page.getByRole("tab", { name: "Memories", exact: true }),
  ).toBeVisible();
  await expect(h.page.getByTestId("circle-wallpaper-frame")).toBeVisible();
  await expect(h.page.locator('img[src*="/files/wp_"]').first()).toBeVisible();
  await expect
    .poll(() =>
      h.page
        .locator('img[src*="/files/wp_"]')
        .first()
        .evaluate((image) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  if (!options.empty)
    await expect(
      h.page.locator('img[src*="/files/photo0item0/"]').first(),
    ).toBeVisible();
  await delay(350);
  return {
    ...h,
    state,
    reads: () => reads,
    revoke: async () => {
      state.members = [];
      state.posts = [];
      state.circles = [];
      await h.refresh();
    },
    refresh: async () => {
      const before = reads;
      await h.refresh();
      await expect.poll(() => reads).toBeGreaterThan(before);
      await delay(150);
    },
  };
}

async function finish(h, name, details = {}) {
  const result = await h.finish(name, { snapshotReads: h.reads(), ...details });
  const summary = { name, width: result.width, ...details };
  const previous = results.findIndex((item) => item.name === name);
  if (previous < 0) results.push(summary);
  else results[previous] = summary;
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  console.log(`PASS ${name}`);
}

async function geometry(h) {
  return h.page.evaluate(() => {
    const image = document.querySelector('img[src*="/files/photo0item0/"]');
    const header = document.querySelector('[data-testid="circle-header"]');
    const rect = image.getBoundingClientRect();
    return {
      firstPhotoTop: Math.round(rect.top),
      firstPhotoWidth: Math.round(rect.width),
      firstPhotoHeight: Math.round(rect.height),
      headerHeight: Math.round(header.getBoundingClientRect().height),
      horizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth,
    };
  });
}

async function openFilters(page) {
  await page
    .getByRole("button", { name: "Filter memories", exact: true })
    .click();
  await expect(page.getByTestId("memory-filters")).toBeVisible();
}

(async () => {
  const browser = await launchBrowser();
  try {
    const cases = [
      ...[320, 390, 1024, 1440].map((width) => [
        `photo-first geometry ${width}`,
        async () => {
          const h = await scenario(browser, width, { longName: width === 320 });
          const layout = await geometry(h);
          assert.equal(layout.horizontalOverflow, false);
          if (mode === "final") {
            assert.ok(
              layout.headerHeight < 180,
              "compact header must not become another banner",
            );
            assert.ok(
              layout.firstPhotoTop < 420,
              "first photo should be visible high in initial viewport",
            );
            await expect(h.page.getByTestId("circle-cover-frame")).toHaveCount(
              0,
            );
            await expect(
              h.page.getByText("Circle journal", { exact: true }),
            ).toHaveCount(0);
            const thumbnail = await h.page
              .getByTestId("circle-cover-image")
              .boundingBox();
            assert.ok(thumbnail.width <= 52 && thumbnail.height <= 52);
            await expect(
              h.page.getByRole("button", {
                name: "Filter memories",
                exact: true,
              }),
            ).toBeVisible();
          }
          await h.page.screenshot({
            path: path.join(output, `${mode}-${width}.png`),
          });
          await finish(h, `photo-first geometry ${width}`, layout);
        },
      ]),
      ...(mode === "baseline"
        ? []
        : [
            [
              "month filter, sorting and reset preserve useful controls",
              async () => {
                const h = await scenario(browser);
                await openFilters(h.page);
                await h.page.getByText("January 2026", { exact: true }).click();
                await h.page
                  .getByRole("button", { name: "Done", exact: true })
                  .click();
                await expect(
                  h.page.getByText("Mock scrapbook memory 1"),
                ).toHaveCount(0);
                await expect(
                  h.page.getByText("Mock scrapbook memory 2"),
                ).toHaveCount(1);
                await expect(
                  h.page.getByText("Mock scrapbook memory 3"),
                ).toHaveCount(1);
                let captions = (
                  await h.page
                    .getByText(/Mock scrapbook memory \d$/)
                    .allTextContents()
                ).map((t) => t.match(/Mock scrapbook memory \d$/)[0]);
                assert.deepEqual(captions, [
                  "Mock scrapbook memory 3",
                  "Mock scrapbook memory 2",
                ]);
                await openFilters(h.page);
                await h.page.getByText("Oldest first", { exact: true }).click();
                await h.page
                  .getByRole("button", { name: "Done", exact: true })
                  .click();
                captions = (
                  await h.page
                    .getByText(/Mock scrapbook memory \d$/)
                    .allTextContents()
                ).map((t) => t.match(/Mock scrapbook memory \d$/)[0]);
                assert.deepEqual(captions, [
                  "Mock scrapbook memory 2",
                  "Mock scrapbook memory 3",
                ]);
                await openFilters(h.page);
                await h.page
                  .getByText("Reset filters", { exact: true })
                  .click();
                await h.page
                  .getByRole("button", { name: "Done", exact: true })
                  .click();
                await expect(
                  h.page.getByText("Mock scrapbook memory 1"),
                ).toHaveCount(1);
                await openFilters(h.page);
                await h.page
                  .getByRole("radio", { name: "January 2026", exact: true })
                  .click();
                await h.page
                  .getByRole("button", { name: "Done", exact: true })
                  .click();
                await h.page
                  .getByRole("button", {
                    name: "Clear memory filters",
                    exact: true,
                  })
                  .click();
                await expect(
                  h.page.getByText("Mock scrapbook memory 1"),
                ).toHaveCount(1);
                await expect(
                  h.page.getByRole("button", {
                    name: "Clear memory filters",
                    exact: true,
                  }),
                ).toHaveCount(0);
                await finish(
                  h,
                  "month filter, sorting and reset preserve useful controls",
                );
              },
            ],
            [
              "thumbnail keyboard entry, square crop movement and cancellation",
              async () => {
                const h = await scenario(browser);
                const edit = h.page.getByRole("button", {
                  name: "Change Circle photo",
                  exact: true,
                });
                const target = await edit.boundingBox();
                assert.ok(target.width >= 44 && target.height >= 44);
                await edit.focus();
                await h.page.keyboard.press("Enter");
                await expect(
                  h.page.getByTestId("circle-cover-editor"),
                ).toBeVisible();
                const chooser = h.page.waitForEvent("filechooser");
                await h.page
                  .getByRole("button", {
                    name: "Choose Circle photo",
                    exact: true,
                  })
                  .click();
                await (
                  await chooser
                ).setFiles(require.resolve("../../assets/photos/forest.jpg"));
                await expect(
                  h.page.getByTestId("circle-cover-cropper"),
                ).toBeVisible();
                const frame = await h.page
                  .getByTestId("circle-cover-cropper")
                  .boundingBox();
                assert.ok(
                  Math.abs(frame.width / frame.height - 1) < 0.01,
                  "Circle photo crop must be square",
                );
                const preview = h.page.getByTestId("circle-cover-preview");
                const before = await preview.getAttribute("style");
                await h.page
                  .getByRole("button", { name: "Zoom in", exact: true })
                  .click();
                await h.page
                  .getByRole("button", { name: "Move photo left", exact: true })
                  .click();
                assert.notEqual(await preview.getAttribute("style"), before);
                await h.page
                  .getByRole("button", { name: "Cancel", exact: true })
                  .click();
                await expect(
                  h.page.getByTestId("circle-cover-editor"),
                ).toHaveCount(0);
                await expect(edit).toBeVisible();
                await edit.focus();
                await h.page.keyboard.press("Space");
                await expect(
                  h.page.getByTestId("circle-cover-editor"),
                ).toBeVisible();
                await h.page
                  .getByRole("button", { name: "Cancel", exact: true })
                  .click();
                await finish(
                  h,
                  "thumbnail keyboard entry, square crop movement and cancellation",
                  { cropAspect: frame.width / frame.height },
                );
              },
            ],
            [
              "chat, highlights, room and secondary options remain reachable",
              async () => {
                const h = await scenario(browser);
                await h.page
                  .getByRole("tab", { name: "Chat", exact: true })
                  .click();
                await expect(h.page.getByPlaceholder(/message/i)).toBeVisible();
                await h.page
                  .getByRole("tab", { name: "Highlights", exact: true })
                  .click();
                await expect(
                  h.page.getByRole("tab", { name: "Highlights", exact: true }),
                ).toHaveAttribute("aria-selected", "true");
                await h.page
                  .getByRole("button", {
                    name: "More Circle options",
                    exact: true,
                  })
                  .click();
                for (const name of [
                  "Invite people",
                  "Calendar",
                  "Members",
                  "Circle settings",
                ])
                  await expect(
                    h.page.getByRole("button", { name, exact: true }),
                  ).toBeVisible();
                await h.page
                  .getByRole("button", {
                    name: "Close Circle options",
                    exact: true,
                  })
                  .last()
                  .click();
                await h.page
                  .getByRole("button", { name: "Join room", exact: true })
                  .click();
                await expect(
                  h.page.getByText("Circle room", { exact: true }).first(),
                ).toBeVisible();
                await finish(
                  h,
                  "chat, highlights, room and secondary options remain reachable",
                );
              },
            ],
            ...[390, 1440].map((width) => [
              `Add memory keeps selected Circle ${width}`,
              async () => {
                const h = await scenario(browser, width);
                await h.page
                  .getByRole(width < 1050 ? "link" : "button", {
                    name: "Add memory",
                    exact: true,
                  })
                  .last()
                  .click();
                await expect(h.page).toHaveURL(/\/create\?circleId=family/);
                await expect(
                  h.page.getByText("Fixture Circle", { exact: true }).last(),
                ).toBeVisible();
                await finish(h, `Add memory keeps selected Circle ${width}`);
              },
            ]),
            [
              "ordinary members see photo without edit controls",
              async () => {
                const h = await scenario(browser, 390, { role: "member" });
                await expect(
                  h.page.getByTestId("circle-cover-image"),
                ).toBeVisible();
                await expect(
                  h.page.getByRole("button", {
                    name: "Change Circle photo",
                    exact: true,
                  }),
                ).toHaveCount(0);
                await h.page
                  .getByRole("button", {
                    name: "More Circle options",
                    exact: true,
                  })
                  .click();
                await expect(
                  h.page.getByRole("button", {
                    name: "Circle settings",
                    exact: true,
                  }),
                ).toHaveCount(0);
                await finish(
                  h,
                  "ordinary members see photo without edit controls",
                );
              },
            ],
            [
              "membership revocation closes private filters and thumbnail",
              async () => {
                const h = await scenario(browser);
                await openFilters(h.page);
                await h.revoke();
                await expect(h.page.getByTestId("memory-filters")).toHaveCount(
                  0,
                );
                await expect(
                  h.page.getByTestId("circle-cover-image"),
                ).toHaveCount(0);
                await expect(
                  h.page.getByText("Mock scrapbook memory 1"),
                ).toHaveCount(0);
                await finish(
                  h,
                  "membership revocation closes private filters and thumbnail",
                );
              },
            ],
            [
              "membership revocation closes photo editor",
              async () => {
                const h = await scenario(browser);
                await h.page
                  .getByRole("button", {
                    name: "Change Circle photo",
                    exact: true,
                  })
                  .click();
                await expect(
                  h.page.getByTestId("circle-cover-editor"),
                ).toBeVisible();
                await h.revoke();
                await expect(
                  h.page.getByTestId("circle-cover-editor"),
                ).toHaveCount(0);
                await expect(
                  h.page.getByTestId("circle-cover-image"),
                ).toHaveCount(0);
                await finish(h, "membership revocation closes photo editor");
              },
            ],
            [
              "role reduction closes editor while member photos remain available",
              async () => {
                const h = await scenario(browser);
                await h.page
                  .getByRole("button", {
                    name: "Change Circle photo",
                    exact: true,
                  })
                  .click();
                await expect(
                  h.page.getByTestId("circle-cover-editor"),
                ).toBeVisible();
                h.state.members.find(
                  (member) => member.userId === "alex",
                ).role = "member";
                await h.refresh();
                await expect(
                  h.page.getByTestId("circle-cover-editor"),
                ).toHaveCount(0);
                await expect(
                  h.page.getByTestId("circle-cover-image"),
                ).toBeVisible();
                await expect(
                  h.page.getByRole("button", {
                    name: "Change Circle photo",
                    exact: true,
                  }),
                ).toHaveCount(0);
                await finish(
                  h,
                  "role reduction closes editor while member photos remain available",
                );
              },
            ],
            [
              "new Circle has one optional photo and requires a name",
              async () => {
                const h = await scenario(browser);
                await h.page.goto(`${base}/new-circle`);
                const add = h.page.getByRole("button", {
                  name: "Add Circle photo",
                  exact: true,
                });
                await expect(add).toHaveCount(1);
                await expect(
                  h.page.getByRole("button", {
                    name: "Create your Circle",
                    exact: true,
                  }),
                ).toBeDisabled();
                await expect(
                  h.page.getByText(/Choose Circle (cover|avatar)/),
                ).toHaveCount(0);
                const chooser = h.page.waitForEvent("filechooser");
                await add.click();
                await (
                  await chooser
                ).setFiles(require.resolve("../../assets/photos/forest.jpg"));
                await expect(
                  h.page.getByRole("button", {
                    name: "Change Circle photo",
                    exact: true,
                  }),
                ).toBeVisible();
                await finish(
                  h,
                  "new Circle has one optional photo and requires a name",
                );
              },
            ],
            [
              "empty Circle and missing photo keep simple entry points",
              async () => {
                const h = await scenario(browser, 390, {
                  empty: true,
                  noPhoto: true,
                });
                await expect(
                  h.page.getByRole("button", {
                    name: "Add Circle photo",
                    exact: true,
                  }),
                ).toBeVisible();
                await expect(
                  h.page.getByRole("link", { name: "Add memory", exact: true }),
                ).toBeVisible();
                await expect(
                  h.page.getByTestId("circle-cover-frame"),
                ).toHaveCount(0);
                await finish(
                  h,
                  "empty Circle and missing photo keep simple entry points",
                );
              },
            ],
          ]),
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
