import { test, expect, type Page } from "@playwright/test";

async function pictures(page: Page, count = 3) {
  const images = await page.evaluate((amount) => {
    const sizes = [
      [360, 540],
      [640, 360],
      [480, 480],
    ];
    return Array.from({ length: amount }, (_, index) => {
      const [width, height] = sizes[index % sizes.length];
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d")!;
      context.fillStyle = ["#CB8C74", "#6B8F80", "#C5AF72"][index % 3];
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#FFFFFF";
      context.fillRect(20, 20, width - 40, height - 40);
      context.fillStyle = ["#CB8C74", "#6B8F80", "#C5AF72"][index % 3];
      context.fillRect(35, 35, width - 70, height - 70);
      return canvas.toDataURL("image/png").split(",")[1];
    });
  }, count);
  return images.map((image, index) => ({
    name: `memory-${index + 1}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  }));
}

async function choose(
  page: Page,
  files: Awaited<ReturnType<typeof pictures>>,
  button = "Photo",
) {
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button, exact: true }).click();
  await (await picker).setFiles(files);
}

test("photo albums preserve chosen order, all images, and viewer navigation after reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/create");
  const files = await pictures(page);
  await choose(page, files);
  await expect(
    page.getByText("3 photos, one memory", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Select photo 2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move photo earlier", exact: true })
    .click();
  await expect(
    page.getByText("Photo 1 of 3 · Cover photo", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("640 × 360 · Full photo, no crop", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Select photo 3", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove photo 3", exact: true })
    .click();
  await expect(
    page.getByText("2 photos, one memory", { exact: true }),
  ).toBeVisible();
  await choose(page, [files[2]], "Add more photos");
  await expect(
    page.getByText("3 photos, one memory", { exact: true }),
  ).toBeVisible();

  const caption = "Three little pieces of our weekend, kept together.";
  await page.getByLabel("Post content", { exact: true }).fill(caption);
  await page.evaluate(() => {
    for (const element of Array.from(document.querySelectorAll("div")))
      if (element.scrollHeight > element.clientHeight + 2)
        element.scrollTop = 0;
  });
  await page.screenshot({
    path: "/tmp/circle-scrapbook-composer-album-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Share moment", exact: true }).click();
  await expect(page).toHaveURL(/\/post\//);
  await page.reload();

  const photo = (index: number) =>
    page.getByRole("img", {
      name: `${caption} · Photo ${index} of 3`,
      exact: true,
    });
  for (const [index, width, height] of [
    [1, 640, 360],
    [2, 360, 540],
    [3, 480, 480],
  ]) {
    await page
      .getByRole("button", { name: `Go to photo ${index} of 3`, exact: true })
      .click();
    await expect
      .poll(() =>
        photo(index).evaluate((node) => ({
          width: (node as HTMLImageElement).naturalWidth,
          height: (node as HTMLImageElement).naturalHeight,
        })),
      )
      .toEqual({ width, height });
  }
  await page
    .getByRole("button", { name: "Go to photo 1 of 3", exact: true })
    .click();
  await expect(page.getByText("1 / 3", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    for (const element of Array.from(document.querySelectorAll("div")))
      if (element.scrollHeight > element.clientHeight + 2)
        element.scrollTop = 0;
  });
  await page.screenshot({
    path: "/tmp/circle-scrapbook-post-album-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open photo full screen", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Photo 1 of 3 · Only in this Circle", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByText("Photo 2 of 3 · Only in this Circle", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Next photo in viewer", exact: true })
    .click();
  await expect(
    page.getByText("Photo 3 of 3 · Only in this Circle", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next photo in viewer", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Close media viewer", exact: true }),
  ).not.toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Next photo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next photo", exact: true }).click();
  await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "/tmp/circle-scrapbook-post-album-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test("ten-photo selection keeps the caption draft and restores adding after removal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/create");
  const caption = "A whole day worth remembering.";
  await page.getByLabel("Post content", { exact: true }).fill(caption);
  await choose(page, await pictures(page, 10));
  await expect(
    page.getByText("10 photos, one memory", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Photo", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Video", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Select photo 10", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove photo 10", exact: true })
    .click();
  await expect(
    page.getByText("9 photos, one memory", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Photo", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Add more photos", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Post content", { exact: true })).toHaveValue(
    caption,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("Circle journal filters by month and reverses the real memory order", async ({
  page,
}) => {
  await page.goto("/create?circleId=family");
  const archived = "A memory from an earlier chapter.";
  await page.getByLabel("Post content", { exact: true }).fill(archived);
  await page.getByRole("button", { name: "Share moment", exact: true }).click();
  await expect(page).toHaveURL(/\/post\//);
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage
          .getItem("circle.demo.v1")
          ?.includes("A memory from an earlier chapter."),
      ),
    )
    .toBeTruthy();
  await page.evaluate(() => {
    const key = "circle.demo.v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.posts.find(
      (post: { content: string }) =>
        post.content === "A memory from an earlier chapter.",
    ).createdAt = "2024-12-15T12:00:00.000Z";
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.goto("/circle/family");
  await page.reload();
  const oldMonth = page.getByRole("button", {
    name: "Show december 2024",
    exact: true,
  });
  await expect(oldMonth).toBeVisible();
  const newest = page.getByText("Less screen time, more green time.", {
    exact: false,
  });
  const memory = page.getByText(archived, { exact: true });
  await expect(memory).toBeVisible();
  expect((await newest.boundingBox())!.y).toBeLessThan(
    (await memory.boundingBox())!.y,
  );
  await page
    .getByRole("button", { name: "Change moment order", exact: true })
    .click();
  expect((await memory.boundingBox())!.y).toBeLessThan(
    (await newest.boundingBox())!.y,
  );
  await oldMonth.click();
  await expect(memory).toBeVisible();
  await expect(newest).toHaveCount(0);
  await page
    .getByRole("button", { name: "Show all moments", exact: true })
    .click();
  await expect(newest).toBeVisible();
});
