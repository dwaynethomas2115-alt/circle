import { test, expect } from "@playwright/test";

test.use({ timezoneId: "America/Whitehorse", reducedMotion: "reduce" });

test("Circle polls create, change one vote, persist, close and delete", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/circle/football?tab=polls");
  await page
    .getByRole("button", { name: "Create a poll", exact: true })
    .click();
  const question = "Where should our next Circle picnic be?";
  await page.getByLabel("Poll question", { exact: true }).fill(question);
  await page
    .getByLabel("Poll option 1", { exact: true })
    .fill("Riverside Park");
  await page
    .getByLabel("Poll option 2", { exact: true })
    .fill("The community garden");
  await page.getByRole("button", { name: "Share poll", exact: true }).click();
  const first = page.getByRole("radio", {
    name: `Vote for Riverside Park in ${question}`,
    exact: true,
  });
  const second = page.getByRole("radio", {
    name: `Vote for The community garden in ${question}`,
    exact: true,
  });
  await expect(first).toBeVisible();
  await first.click();
  await expect(first).toBeChecked();
  await second.click();
  await expect(second).toBeChecked();
  await expect(first).not.toBeChecked();
  const card = page.getByText(question, { exact: true }).locator("..");
  await expect(card.getByText("1 · 100%", { exact: true })).toBeVisible();
  await page.reload();
  await expect(second).toBeChecked();
  await page
    .getByRole("button", { name: `Close poll: ${question}`, exact: true })
    .click();
  await expect(first).toBeDisabled();
  await expect(second).toBeDisabled();
  await page
    .getByRole("button", { name: `Delete poll: ${question}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete poll permanently", exact: true })
    .click();
  await expect(page.getByText(question, { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Circle calendar validates local times, creates plans and changes RSVP", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/circle/football?tab=calendar");
  await page
    .getByRole("button", { name: "Create an event", exact: true })
    .click();
  const title = "A little Circle garden picnic";
  await page.getByLabel("Event title", { exact: true }).fill(title);
  await page
    .getByLabel("Event details", { exact: true })
    .fill("Bring a blanket and something lovely to share.");
  await page
    .getByLabel("Event location", { exact: true })
    .fill("Riverside community garden");
  const futureDate = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 2);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  await page.getByLabel("Start date", { exact: true }).fill(futureDate);
  await page.getByLabel("End date", { exact: true }).fill(futureDate);
  await page.getByLabel("Start time", { exact: true }).fill("18:30");
  await page.getByLabel("End time", { exact: true }).fill("17:30");
  await page
    .getByRole("button", { name: "Add to Circle calendar", exact: true })
    .click();
  await expect(
    page.getByText("The event needs to end after it starts.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("End time", { exact: true }).fill("19:30");
  await page
    .getByRole("button", { name: "Add to Circle calendar", exact: true })
    .click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(
    page.getByText("Riverside community garden", { exact: true }),
  ).toBeVisible();
  const going = page.getByRole("button", {
    name: `Going to ${title}`,
    exact: true,
  });
  const maybe = page.getByRole("button", {
    name: `Maybe to ${title}`,
    exact: true,
  });
  await going.click();
  await expect(going).toHaveAttribute("aria-pressed", "true");
  await maybe.click();
  await expect(maybe).toHaveAttribute("aria-pressed", "true");
  await expect(going).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByText("0 going · 1 maybe", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(maybe).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: `Delete event: ${title}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete event permanently", exact: true })
    .click();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("theme previews apply only to one Circle and survive reload", async ({
  page,
}) => {
  const buttonColor = () =>
    page
      .getByRole("button", { name: "Share a moment", exact: true })
      .evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.goto("/circle/school");
  const schoolColor = await buttonColor();
  await page.goto("/circle/football?tab=settings");
  const originalColor = await buttonColor();
  await page
    .getByLabel("Theme description", { exact: true })
    .fill("Pink unicorns, blush and a little everyday magic");
  await page
    .getByRole("button", { name: "Preview from description", exact: true })
    .click();
  await expect(
    page.getByText(
      "Your prompt matched a curated demo preset. Preview it below, then apply when you’re happy.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await buttonColor()).toBe(originalColor);
  await page
    .getByRole("button", { name: "Apply to this Circle", exact: true })
    .click();
  await expect.poll(buttonColor).toBe("rgb(164, 62, 120)");
  await page.reload();
  await expect.poll(buttonColor).toBe("rgb(164, 62, 120)");
  await page.goto("/circle/school");
  expect(await buttonColor()).toBe(schoolColor);
  await page.goto("/circle/football?tab=settings");
  await page
    .getByRole("radio", { name: "The Vegas weekend", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply to this Circle", exact: true })
    .click();
  await expect.poll(buttonColor).toBe("rgb(34, 99, 79)");
  await page.goto("/circle/family");
  await expect.poll(buttonColor).toBe("rgb(164, 62, 120)");
  await page.screenshot({
    path: "/tmp/circle-family-theme.png",
    fullPage: true,
  });
  await page.goto("/");
  await expect(
    page.getByText("Welcome home, Alex.", { exact: false }),
  ).toBeVisible();
  expect(
    await page
      .getByText("circle.", { exact: true })
      .first()
      .evaluate((element) => getComputedStyle(element).color),
  ).toBe("rgb(32, 59, 57)");
});

test("catch-up opens a playable private montage and saves read state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/circle/family?tab=catch-up");
  await expect(
    page.getByText("A little while. A lot of life.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Play Circle montage", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Close montage", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause montage", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play montage", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close montage", exact: true })
    .click();
  await page
    .getByRole("button", { name: "I’m all caught up", exact: true })
    .click();
  await expect(
    page.getByText("You’re all caught up. A little closer, just like that.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(
      "You’re up to date. Take another look at the moments that made your week.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
