import { test, expect } from "@playwright/test";
test("home, reactions, threaded comments, publishing and persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByText("Welcome home, Alex.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "A private trail recommendation for club members. See you out there!",
      { exact: true },
    ),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Remove reaction", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Like post", exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "View comments" }).first().click();
  await page
    .getByLabel("Comment", { exact: true })
    .fill("This is what weekends are for!");
  await page.getByRole("button", { name: "Send comment", exact: true }).click();
  await expect(
    page.getByText("This is what weekends are for!", { exact: true }),
  ).toBeVisible();
  await page.getByText("Reply", { exact: true }).first().click();
  await page
    .getByLabel("Comment", { exact: true })
    .fill("Count me in for the next one.");
  await page.getByRole("button", { name: "Send comment", exact: true }).click();
  await expect(
    page.getByText("Count me in for the next one.", { exact: true }),
  ).toBeVisible();
  await page.goto("/create");
  await page
    .getByLabel("Post content", { exact: true })
    .fill("A fresh little moment from the browser test.");
  await page.getByRole("button", { name: "Share moment", exact: true }).click();
  await expect(page).toHaveURL(/\/post\//);
  await expect(
    page.getByText("A fresh little moment from the browser test.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("A fresh little moment from the browser test.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("Circle creation, private chat, invite and pending discovery", async ({
  page,
}) => {
  await page.goto("/new-circle");
  await page
    .getByLabel("Circle name", { exact: true })
    .fill("Our Sunday table");
  await page
    .getByLabel("A little about your Circle", { exact: true })
    .fill("Recipes, stories, and Sunday lunches.");
  await page
    .getByRole("button", { name: "Create your Circle", exact: true })
    .click();
  await expect(
    page.getByText("Our Sunday table", { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await page
    .getByLabel("Message your Circle", { exact: true })
    .fill("Sunday lunch at one?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("Sunday lunch at one?", { exact: true }),
  ).toBeVisible();
  await page.goto("/circles");
  await page.getByRole("tab", { name: "Discover", exact: true }).click();
  await expect(
    page.getByText("The Weekend Club", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Request to join", exact: true })
    .click();
  await page.getByRole("tab", { name: /Pending/ }).click();
  await expect(
    page.getByText("The Weekend Club", { exact: true }),
  ).toBeVisible();
});
test("profile edits, logout, welcome and adult demo signup", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/profile");
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByLabel("Bio", { exact: true }).fill("A new little bio.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("A new little bio.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByText("Your people.", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Find your Circle", exact: true })
    .click();
  await page.getByLabel("Your name", { exact: true }).fill("Taylor Quinn");
  await page.getByLabel("Username", { exact: true }).fill("taylorquinn");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("taylor@example.com");
  await page.getByRole("checkbox").click();
  await page
    .getByRole("button", { name: "Create your account", exact: true })
    .click();
  await expect(
    page.getByText("Welcome home, Taylor.", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("phone layout stays within viewport and navigates", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByText("Welcome home, Alex.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("link", { name: "Circles", exact: true }).click();
  await expect(
    page.getByText("Your people, in one place.", { exact: true }),
  ).toBeVisible();
});
test("chosen photos remain visible after a full reload", async ({ page }) => {
  await page.goto("/create");
  await page
    .getByLabel("Post content", { exact: true })
    .fill("A photo saved for another day.");
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await (await picker).setFiles("assets/photos/neighborhood.jpg");
  await expect(
    page.getByRole("button", { name: "Remove media", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Share moment", exact: true }).click();
  await expect(page).toHaveURL(/\/post\//);
  await expect(
    page.getByText("A photo saved for another day.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  const photo = page.getByRole("img", {
    name: "A photo saved for another day.",
    exact: true,
  });
  await expect(photo).toBeVisible();
  await expect
    .poll(() =>
      photo.evaluate(
        (el) =>
          (el as HTMLImageElement).complete &&
          (el as HTMLImageElement).naturalWidth > 0,
      ),
    )
    .toBeTruthy();
});
