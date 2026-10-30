import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

test.use({ timezoneId: "America/Whitehorse", reducedMotion: "reduce" });

async function expectPrimaryNavigation(page: Page) {
  for (const name of ["Feed", "Highlights", "Chat", "About"]) {
    await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("tab", { name: /^Members/ })).toBeVisible();
  const tabs = (await page.getByRole("tab").allTextContents()).map((value) =>
    value.trim(),
  );
  expect(tabs.slice(0, 5)).toEqual([
    "Feed",
    "Highlights",
    "Chat",
    expect.stringMatching(/^Members/),
    "About",
  ]);
  for (const name of ["Room", "Calendar", "Polls", "Catch up"]) {
    await expect(page.getByRole("tab", { name, exact: true })).toHaveCount(0);
  }
}

test("Circle navigation keeps room and calendar in header actions and polls in Chat", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/circle/football");
  await expectPrimaryNavigation(page);
  await expect(
    page.getByRole("tab", { name: "Feed", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Highlights", exact: true }).click();
  await expect(
    page.getByText("Your Circle’s Highlights.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Compose poll", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Match day plans — where are we watching?", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Everyone gets a say.", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(
    page.getByText("Circle calendar", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Back to Circle", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Chat", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByLabel("Message your Circle", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Join room", exact: true }).click();
  await expect(
    page.getByText("No remote participants or live presence are simulated.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Close room", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Chat", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goto("/circle/football?tab=polls");
  await expect(
    page.getByRole("tab", { name: "Chat", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Poll question", { exact: true })).toBeVisible();
  await expectPrimaryNavigation(page);
  await page.goto("/circle/family?tab=catch-up");
  await expect(
    page.getByRole("tab", { name: "Highlights", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByText("Your Circle’s Highlights.", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("Circle chat polls create, change one vote, persist, close and delete", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/circle/football?tab=chat");
  await expect(
    page.getByRole("tab", { name: "Chat", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByText("Everyone gets a say.", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Compose poll", exact: true }).click();
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
  await page.goto("/circle/football");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(
    page.getByText("Circle calendar", { exact: true }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
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

test("AI wallpaper settings accept a combined prompt and preserve the saved theme when unavailable", async ({
  page,
}) => {
  const errors: string[] = [];
  const aiRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/api\.openai\.com|\/storage\/v1\//.test(request.url()))
      aiRequests.push(request.url());
  });
  const buttonColor = () =>
    page
      .getByRole("button", { name: "Share a moment", exact: true })
      .evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.goto("/circle/school");
  const schoolColor = await buttonColor();
  await page.goto("/circle/football?tab=settings");
  const originalColor = await buttonColor();
  const savedThemes = await page.evaluate(
    () => JSON.parse(localStorage.getItem("circle.features.v1") || "{}").themes,
  );
  const prompt = page.getByLabel("Theme prompt", { exact: true });
  await expect(
    page.getByText("Dream up your Circle", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "AI wallpapers need a connected Circle backend. Local Demo doesn’t generate images.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(prompt).toHaveAttribute("maxlength", "1000");
  await expect(page.getByRole("radio")).toHaveCount(0);
  const description =
    "Anastasia likes pink and Barbies and Daelin likes tornados and volcanos. " +
    "Blend all of their favorite things into one colorful illustrated wallpaper. " +
    "Include pink dollhouses, swirling tornadoes, glowing volcanoes, magical clouds, and bright playful landscapes. " +
    "Make each subject clearly visible and give the whole Circle a joyful, imaginative atmosphere with plenty of detail.";
  expect(description.length).toBeGreaterThan(300);
  await prompt.fill(description);
  await expect(prompt).toHaveValue(description);
  await page
    .getByRole("button", { name: "Generate wallpaper", exact: true })
    .click();
  await expect(
    page.getByText(
      "AI wallpaper generation needs a connected backend and a server-side OpenAI API key. Local Demo keeps your current theme unchanged.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(prompt).toHaveValue(description);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(prompt).toHaveValue(description);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await prompt.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/circle-wallpaper-editor-phone.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await buttonColor()).toBe(originalColor);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("circle.features.v1") || "{}").themes,
    ),
  ).toEqual(savedThemes);
  await expect(
    page.getByText(/Your prompt matched a curated demo preset/),
  ).toHaveCount(0);
  await page.reload();
  expect(await buttonColor()).toBe(originalColor);
  await page.goto("/circle/school");
  expect(await buttonColor()).toBe(schoolColor);
  await page.goto("/circle/family");
  await expect.poll(buttonColor).toBe("rgb(164, 62, 120)");
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
  expect(aiRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("Highlights opens a playable private montage and saves read state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/circle/family");
  await page.getByRole("tab", { name: "Highlights", exact: true }).click();
  await expect(
    page.getByText("Your Circle’s Highlights.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Play Highlights montage", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Close Highlights", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause Highlights", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume Highlights", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close Highlights", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mark highlights seen", exact: true })
    .click();
  await expect(
    page.getByText(
      "Your Highlights progress is saved. A little closer, just like that.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Highlights", exact: true }).click();
  await expect(
    page.getByText(
      "You’re up to date. Take another look at the moments that made your week.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
