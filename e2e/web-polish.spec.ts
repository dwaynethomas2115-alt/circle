import { test, expect, type Page } from "@playwright/test";

// Every action in this suite runs against the explicit local demo. It never
// signs into a hosted account, uploads a personal file, or calls a provider.
test.use({ timezoneId: "America/Whitehorse", reducedMotion: "reduce" });
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["localhost", "127.0.0.1"].includes(url.hostname) ||
      ["data:", "blob:"].includes(url.protocol)
      ? route.continue()
      : route.abort();
  });
});

async function expectFits(page: Page, width: number) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width);
}

for (const width of [375, 393, 430, 1440]) {
  test(`photo-first Home and calendar adapt at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.getByText("LOCAL DEMO", { exact: true })).toBeVisible();
    const circles = page.getByTestId("home-circles");
    await expect(circles.getByText(/^your circles$/i)).toBeVisible();
    const feed = page.getByTestId("home-feed");
    await expect(feed).toBeVisible();
    expect((await circles.boundingBox())!.y).toBeLessThan(
      (await feed.boundingBox())!.y,
    );
    await expect(
      feed
        .getByRole("button", { name: "Open photo full screen", exact: true })
        .first(),
    ).toBeVisible();
    await expectFits(page, width);

    await page.goto("/circle/family");
    const header = page.getByTestId("circle-header");
    await expect(header).toBeVisible();
    expect((await header.boundingBox())!.height).toBeLessThan(160);
    const tabs = header.getByRole("tab");
    expect(await tabs.allTextContents()).toEqual([
      "Memories",
      "Chat",
      "Highlights",
    ]);
    for (const tab of await tabs.all()) {
      const box = (await tab.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await expectFits(page, width);

    await page.goto("/plans?circleId=family");
    const calendar = page.getByTestId("circle-calendar");
    await expect(calendar).toBeVisible();
    await expect(
      page.getByText("A slow Sunday picnic", { exact: true }),
    ).toBeVisible();
    const layout = page.getByTestId("calendar-layout");
    const month = layout.locator(":scope > div").first();
    const agenda = page.getByTestId("calendar-agenda");
    const monthBox = (await month.boundingBox())!;
    const agendaBox = (await agenda.boundingBox())!;
    if (width >= 1180) {
      expect(agendaBox.x).toBeGreaterThanOrEqual(monthBox.x + monthBox.width);
      expect(Math.abs(agendaBox.y - monthBox.y)).toBeLessThan(2);
    } else {
      expect(agendaBox.y).toBeGreaterThanOrEqual(monthBox.y + monthBox.height);
      expect(Math.abs(agendaBox.x - monthBox.x)).toBeLessThan(2);
    }
    const previous = calendar.getByRole("button", {
      name: "Previous calendar month",
      exact: true,
    });
    const next = calendar.getByRole("button", {
      name: "Next calendar month",
      exact: true,
    });
    const heading = month.getByRole("heading").first();
    const initialMonth = await heading.innerText();
    await next.click();
    await expect(heading).not.toHaveText(initialMonth);
    await previous.click();
    await expect(heading).toHaveText(initialMonth);
    const rsvp = page.getByRole("button", {
      name: "Going to A slow Sunday picnic",
      exact: true,
    });
    const rsvpBox = (await rsvp.boundingBox())!;
    expect(rsvpBox.width).toBeGreaterThanOrEqual(44);
    expect(rsvpBox.height).toBeGreaterThanOrEqual(44);
    await expectFits(page, width);
    expect(errors).toEqual([]);
  });
}

test("Highlights respects reduced motion, keyboard navigation, and explicit seen confirmation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/circle/family?tab=highlights");
  const content = page.getByTestId("highlights-content");
  const info = page.getByTestId("highlights-info");
  await expect(content).toBeVisible();
  expect((await content.boundingBox())!.y).toBeLessThan(
    (await info.boundingBox())!.y,
  );
  const savedBefore = await page.evaluate(() =>
    localStorage.getItem("circle.features.v1"),
  );
  await page
    .getByRole("button", { name: "Play Highlights montage", exact: true })
    .click();
  const dialog = page.getByTestId("highlights-dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("Continue at your own pace", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText(/^1 \/ \d+ moments$/)).toBeVisible();
  // Synthetic focused native-control shapes exercise the global arrow guard;
  // this does not claim to test a real browser video's playback controls.
  for (const kind of ["input", "slider", "video"]) {
    await dialog.evaluate((node, type) => {
      const control = document.createElement(type === "slider" ? "div" : type);
      control.setAttribute("data-testid", "focused-story-control");
      control.setAttribute("tabindex", "0");
      if (type === "slider") control.setAttribute("role", "slider");
      node.appendChild(control);
      control.focus();
    }, kind);
    await page.keyboard.press("ArrowRight");
    await expect(dialog.getByText(/^1 \/ \d+ moments$/)).toBeVisible();
    await page
      .getByTestId("focused-story-control")
      .evaluate((node) => node.remove());
  }
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByText(/^2 \/ \d+ moments$/)).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByText(/^1 \/ \d+ moments$/)).toBeVisible();
  for (const name of ["Previous moment", "Next moment", "Close Highlights"]) {
    const box = (await dialog
      .getByRole("button", { name, exact: true })
      .boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const frame = page.getByTestId("highlights-frame");
  await expect
    .poll(() => frame.evaluate((node) => getComputedStyle(node).opacity))
    .toBe("1");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  // Viewing/closing the reel alone is not permission to write seen progress.
  expect(
    await page.evaluate(() => localStorage.getItem("circle.features.v1")),
  ).toBe(savedBefore);
  expect(errors).toEqual([]);
});

test("Plans refuses another Circle and drops a revoked selection in the local demo", async ({
  page,
}) => {
  await page.goto("/plans?circleId=weekend");
  await expect(
    page.getByText("Choose a Circle for your plans", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("circle-calendar")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Show plans for The Weekend Club",
      exact: true,
    }),
  ).toHaveCount(0);

  // Persist a synthetic local demo state, then simulate revocation on reload.
  // This is UI scoping evidence, not a hosted backend revocation test.
  await page.goto("/");
  await page
    .getByRole("button", { name: "Remove reaction", exact: true })
    .first()
    .click();
  await expect
    .poll(() => page.evaluate(() => !!localStorage.getItem("circle.demo.v1")))
    .toBe(true);
  await page.evaluate(() => {
    const key = "circle.demo.v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.members = state.members.filter(
      (member: { userId: string; circleId: string }) =>
        member.userId !== state.currentUserId || member.circleId !== "family",
    );
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.goto("/plans?circleId=family");
  await page.reload();
  await expect(
    page.getByText("Choose a Circle for your plans", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("circle-calendar")).toHaveCount(0);
  await expect(
    page.getByText("A slow Sunday picnic", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Show plans for Anastasia’s Circle",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Show plans for Football Friends",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("circle-calendar")).toBeVisible();
  await expect(
    page.getByText("Saturday match day", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("A slow Sunday picnic", { exact: true }),
  ).toHaveCount(0);
});

test("switching Plans Circles discards an unsaved event draft without writing it elsewhere", async ({
  page,
}) => {
  await page.goto("/plans?circleId=family");
  await expect(page.getByTestId("circle-calendar")).toBeVisible();
  await page
    .getByRole("button", { name: "Create an event", exact: true })
    .click();
  await page
    .getByLabel("Event title", { exact: true })
    .fill("Only a draft for family");
  await page
    .getByLabel("Event location", { exact: true })
    .fill("Private family draft location");
  await page
    .getByRole("button", {
      name: "Show plans for Football Friends",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Saturday match day", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Event title", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Only a draft for family", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create an event", exact: true })
    .click();
  await expect(page.getByLabel("Event title", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Event location", { exact: true })).toHaveValue(
    "",
  );
  await page.reload();
  await expect(
    page.getByText("Only a draft for family", { exact: true }),
  ).toHaveCount(0);
});

for (const width of [375, 393, 430]) {
  test(`important web controls remain usable with 130% text at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    // Increase each rendered text node from its computed size. This is a browser
    // text stress test; it does not claim to emulate iOS Dynamic Type.
    const enlargeText = () =>
      page.evaluate(() => {
        const text = Array.from(
          document.querySelectorAll<HTMLElement>('[dir="auto"]'),
        ).map((node) => ({
          node,
          size: parseFloat(getComputedStyle(node).fontSize),
          line: parseFloat(getComputedStyle(node).lineHeight),
        }));
        for (const { node, size, line } of text) {
          node.style.fontSize = `${size * 1.3}px`;
          if (Number.isFinite(line)) node.style.lineHeight = `${line * 1.3}px`;
        }
      });
    await page.goto("/circle/family");
    await expect(page.getByTestId("circle-header")).toBeVisible();
    await enlargeText();
    for (const name of ["Memories", "Chat", "Highlights"]) {
      const tab = page.getByRole("tab", { name, exact: true });
      await expect(tab).toBeVisible();
      expect(
        await tab.evaluate((node) => node.scrollWidth - node.clientWidth),
      ).toBeLessThanOrEqual(1);
    }
    await expectFits(page, width);
    await page.goto("/plans?circleId=family");
    await expect(page.getByTestId("circle-calendar")).toBeVisible();
    await enlargeText();
    await expect(
      page.getByRole("button", { name: "Calendar AI", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create an event", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Going to A slow Sunday picnic",
        exact: true,
      }),
    ).toBeVisible();
    await expectFits(page, width);
  });
}
