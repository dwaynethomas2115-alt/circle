const {
  fixture,
  launchBrowser,
  expect,
  assert,
  base,
  output,
} = require("../performance/helpers.cjs");
const { Buffer } = require("node:buffer");
const path = require("node:path");
const proposal = {
  events: [
    {
      title: "Family dinner",
      description: "Bring a dish",
      location: "Home",
      startsAt: "2099-01-03T18:00:00Z",
      endsAt: "2099-01-03T19:00:00Z",
      warnings: [],
    },
  ],
  warnings: [],
};
const endpoint =
  "https://circle-test.example/v1/functions/circle-api/executions";
async function setup(
  browser,
  {
    width = 390,
    result = proposal,
    failSave = false,
    failProvider = false,
  } = {},
) {
  const h = await fixture(browser, { width, posts: 0, latency: 1 });
  const seen = [];
  let saves = 0,
    fail = failSave;
  const headers = {
    "access-control-allow-origin": base,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "*",
    "content-type": "application/json",
  };
  const exec = (route, data, status = 200) =>
    route.fulfill({
      headers,
      body: JSON.stringify({
        $id: "mock-calendar",
        status: "completed",
        responseStatusCode: status,
        responseBody: JSON.stringify(
          status >= 400 ? { error: data } : { data },
        ),
      }),
    });
  await h.context.route(endpoint, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    const req = route.request().postDataJSON();
    const body = JSON.parse(req.body);
    if (
      ![
        "calendarCapabilities",
        "analyzeCalendar",
        "calendarResult",
        "saveCalendar",
      ].includes(body.kind)
    )
      return route.fallback();
    seen.push(body);
    if (body.kind === "calendarCapabilities")
      return exec(route, { model: "gpt-6-luna" });
    if (body.kind === "analyzeCalendar") {
      assert.equal(req.async, true);
      return exec(route, { status: "processing" });
    }
    if (body.kind === "calendarResult")
      return exec(
        route,
        failProvider
          ? {
              status: "failed",
              error: "Luna model access needs checking. No events saved.",
            }
          : { status: "ready", proposal: result },
      );
    saves++;
    assert.equal(body.confirmed, true);
    assert.ok(body.events.every((e) => e.reviewed === true));
    if (fail) {
      fail = false;
      return exec(
        route,
        "Connection interrupted after save. Retry this unchanged batch.",
        503,
      );
    }
    return exec(route, {
      status: "saved",
      eventIds: body.events.map((_, i) => `event-${i}`),
      skipped: 0,
    });
  });
  await h.page.goto(base + "/circle/family?tab=calendar");
  await expect(h.page.getByText("Plan with AI", { exact: true })).toBeVisible();
  const analyze = async () => {
    await h.page
      .getByLabel("Describe or clarify your plans")
      .fill("Dinner January 3 2099, 18:00 to 19:00 UTC");
    await h.page
      .getByRole("button", { name: "Analyze plans", exact: true })
      .click();
  };
  return { ...h, seen, analyze, saves: () => saves };
}
(async () => {
  const browser = await launchBrowser();
  let completed = 0;
  async function run(name, fn, options) {
    const h = await setup(browser, options);
    try {
      await fn(h);
      await h.finish(name, {
        calendarRequests: h.seen.map((r) => r.kind),
        saves: h.saves(),
      });
      completed++;
      console.log("PASS " + name);
    } catch (e) {
      await h.page.screenshot({
        path: path.join(output, "calendar-failure.png"),
        fullPage: true,
      });
      console.error((await h.page.locator("body").innerText()).slice(-6000));
      throw e;
    }
  }
  try {
    await run(
      "calendar requires per-event review then final confirmation",
      async (h) => {
        await h.analyze();
        await expect(h.page.getByLabel("Title 1", { exact: true })).toHaveValue(
          "Family dinner",
        );
        assert.equal(h.saves(), 0);
        const final = h.page.getByRole("button", {
          name: "Review final batch (1)",
          exact: true,
        });
        await expect(final).toBeDisabled();
        await h.page
          .getByRole("button", {
            name: "I reviewed event 1 and its warnings",
            exact: true,
          })
          .click();
        await expect(final).toBeEnabled();
        await final.click();
        assert.equal(h.saves(), 0);
        await h.page
          .getByRole("button", {
            name: "Confirm and save 1 events",
            exact: true,
          })
          .click();
        await expect(
          h.page.getByText("Saved 1 events. 0 duplicates skipped.", {
            exact: true,
          }),
        ).toBeVisible();
        assert.equal(h.saves(), 1);
      },
    );
    await run(
      "calendar editing invalidates review and confirmation",
      async (h) => {
        await h.analyze();
        await h.page
          .getByRole("button", {
            name: "I reviewed event 1 and its warnings",
            exact: true,
          })
          .click();
        await h.page
          .getByRole("button", { name: "Review final batch (1)", exact: true })
          .click();
        await h.page
          .getByLabel("Title 1", { exact: true })
          .fill("Edited dinner");
        await expect(
          h.page.getByRole("button", {
            name: "Confirm and save 1 events",
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          h.page.getByRole("button", {
            name: "Review final batch (1)",
            exact: true,
          }),
        ).toBeDisabled();
        assert.equal(h.saves(), 0);
      },
    );
    await run(
      "calendar missing times require clarification and manual correction",
      async (h) => {
        await h.analyze();
        await expect(
          h.page.getByRole("button", {
            name: "I reviewed event 1 and its warnings",
            exact: true,
          }),
        ).toBeDisabled();
        await h.page
          .getByLabel("Start (ISO date, time and offset) 1", { exact: true })
          .fill("2099-01-03T18:00:00Z");
        await h.page
          .getByLabel("End (ISO date, time and offset) 1", { exact: true })
          .fill("2099-01-03T19:00:00Z");
        await expect(
          h.page.getByRole("button", {
            name: "I reviewed event 1 and its warnings",
            exact: true,
          }),
        ).toBeEnabled();
        assert.equal(h.saves(), 0);
      },
      {
        result: {
          events: [
            {
              ...proposal.events[0],
              startsAt: "",
              endsAt: "",
              warnings: ["What time does dinner begin and end?"],
            },
          ],
          warnings: [],
        },
      },
    );
    await run(
      "calendar lost save response retries identical batch ID and payload",
      async (h) => {
        await h.analyze();
        await h.page
          .getByRole("button", {
            name: "I reviewed event 1 and its warnings",
            exact: true,
          })
          .click();
        await h.page
          .getByRole("button", { name: "Review final batch (1)", exact: true })
          .click();
        await h.page
          .getByRole("button", {
            name: "Confirm and save 1 events",
            exact: true,
          })
          .click();
        await expect(
          h.page.getByText(
            "Connection interrupted after save. Retry this unchanged batch.",
            { exact: true },
          ),
        ).toBeVisible();
        await h.page
          .getByRole("button", {
            name: "Confirm and save 1 events",
            exact: true,
          })
          .click();
        await expect(
          h.page.getByText("Saved 1 events. 0 duplicates skipped.", {
            exact: true,
          }),
        ).toBeVisible();
        const saves = h.seen.filter((r) => r.kind === "saveCalendar");
        assert.equal(saves.length, 2);
        assert.deepEqual(saves[0], saves[1]);
      },
      { failSave: true },
    );
    await run(
      "calendar provider failure preserves source and same analysis ID",
      async (h) => {
        await h.analyze();
        await expect(
          h.page.getByText(
            "Luna model access needs checking. No events saved.",
            { exact: true },
          ),
        ).toBeVisible();
        await h.page
          .getByRole("button", { name: "Analyze plans", exact: true })
          .click();
        await expect(
          h.page.getByRole("button", { name: "Analyze plans", exact: true }),
        ).toBeEnabled();
        const requests = h.seen.filter((r) => r.kind === "analyzeCalendar");
        assert.equal(requests.length, 2);
        assert.equal(requests[0].requestId, requests[1].requestId);
        assert.equal(h.saves(), 0);
      },
      { failProvider: true },
    );
    await run(
      "calendar TXT attachment uses strict UTF-8 and keeps source out of storage",
      async (h) => {
        const choose = h.page.waitForEvent("filechooser");
        await h.page
          .getByRole("button", {
            name: "Choose calendar attachment",
            exact: true,
          })
          .click();
        await (
          await choose
        ).setFiles({
          name: "plans.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Dinner January 3 2099 18:00–19:00 UTC"),
        });
        await expect(
          h.page.getByText("Attached: plans.txt", { exact: true }),
        ).toBeVisible();
        await h.page
          .getByRole("button", { name: "Analyze plans", exact: true })
          .click();
        await expect(
          h.page.getByLabel("Title 1", { exact: true }),
        ).toBeVisible();
        const req = h.seen.find((r) => r.kind === "analyzeCalendar");
        assert.equal(req.input.attachment.type, "text");
        assert.match(req.input.attachment.content, /Dinner/);
        assert.deepEqual(
          await h.page.evaluate(() => [
            localStorage.length,
            sessionStorage.length,
          ]),
          [0, 0],
        );
      },
    );
    await run(
      "calendar image resized to bounded JPEG for analysis",
      async (h) => {
        const choose = h.page.waitForEvent("filechooser");
        await h.page
          .getByRole("button", {
            name: "Choose calendar attachment",
            exact: true,
          })
          .click();
        await (await choose).setFiles(path.resolve("assets/photos/forest.jpg"));
        await expect(
          h.page.getByText("Attached: forest.jpg", { exact: true }),
        ).toBeVisible();
        await h.page
          .getByRole("button", { name: "Analyze plans", exact: true })
          .click();
        await expect(
          h.page.getByLabel("Title 1", { exact: true }),
        ).toBeVisible();
        const image = h.seen.find((r) => r.kind === "analyzeCalendar").input
          .attachment;
        assert.equal(image.type, "image");
        assert.ok(Buffer.from(image.base64, "base64").length <= 192 * 1024);
        assert.equal(h.saves(), 0);
      },
    );
    await run(
      "calendar unsupported attachment rejected before provider",
      async (h) => {
        const choose = h.page.waitForEvent("filechooser");
        await h.page
          .getByRole("button", {
            name: "Choose calendar attachment",
            exact: true,
          })
          .click();
        await (
          await choose
        ).setFiles({
          name: "plans.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.0"),
        });
        await expect(
          h.page.getByText(/Choose JPEG, PNG or WebP up to 10 MiB/),
        ).toBeVisible();
        assert.equal(h.seen.length, 0);
      },
    );
    await run(
      "calendar desktop source edits clear old proposals",
      async (h) => {
        await h.analyze();
        await expect(
          h.page.getByLabel("Title 1", { exact: true }),
        ).toBeVisible();
        await h.page
          .getByLabel("Describe or clarify your plans")
          .fill("Different plans");
        await expect(h.page.getByLabel("Title 1", { exact: true })).toHaveCount(
          0,
        );
        assert.equal(h.saves(), 0);
        await h.page.screenshot({
          path: path.join(output, "calendar-desktop.png"),
          fullPage: true,
        });
      },
      { width: 1440 },
    );
    await run(
      "calendar excludes unreviewed proposals from batch",
      async (h) => {
        await h.analyze();
        await h.page
          .getByRole("button", { name: "Exclude event 2", exact: true })
          .click();
        await h.page
          .getByRole("button", {
            name: "I reviewed event 1 and its warnings",
            exact: true,
          })
          .click();
        await h.page
          .getByRole("button", { name: "Review final batch (1)", exact: true })
          .click();
        await h.page
          .getByRole("button", {
            name: "Confirm and save 1 events",
            exact: true,
          })
          .click();
        await expect(
          h.page.getByText("Saved 1 events. 0 duplicates skipped.", {
            exact: true,
          }),
        ).toBeVisible();
        assert.equal(
          h.seen.find((r) => r.kind === "saveCalendar").events.length,
          1,
        );
      },
      {
        result: {
          events: [
            proposal.events[0],
            { ...proposal.events[0], title: "Second event" },
          ],
          warnings: [],
        },
      },
    );
  } finally {
    await browser.close();
    console.log(`${completed} mocked browser cases passed`);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
