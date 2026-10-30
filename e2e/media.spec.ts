import { test, expect } from "@playwright/test";

test("photos open at full size and the viewer closes with Escape", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open photo full screen", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Close media viewer", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Close media viewer", exact: true }),
  ).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("portrait photos retain their proportions through preview, publishing and reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/create");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 800;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#CEDAC5";
    ctx.fillRect(0, 0, 400, 800);
    ctx.fillStyle = "#137F70";
    ctx.fillRect(20, 20, 360, 760);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await (
    await picker
  ).setFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(
    page.getByText("400 × 800 · Full photo, no crop", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preview photo full screen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Close media viewer", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close media viewer", exact: true })
    .click();
  await page
    .getByLabel("Post content", { exact: true })
    .fill("Portrait moments deserve the whole picture.");
  await page.getByRole("button", { name: "Share moment", exact: true }).click();
  await expect(page).toHaveURL(/\/post\//);
  await page.reload();
  const photo = page.getByRole("img", {
    name: "Portrait moments deserve the whole picture.",
    exact: true,
  });
  await expect(photo).toBeVisible();
  await expect
    .poll(() =>
      photo.evaluate((el) => {
        const image = el as HTMLImageElement;
        return image.naturalWidth === 400 && image.naturalHeight === 800;
      }),
    )
    .toBeTruthy();
  expect(errors).toEqual([]);
});

test("large photos keep 4096-pixel detail through preview, publishing, and reload", async ({
  page,
}) => {
  await page.goto("/create");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 6000;
    canvas.height = 4000;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#CEDAC5";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#137F70";
    context.fillRect(200, 200, 5600, 3600);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await (
    await picker
  ).setFiles({
    name: "large-landscape.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(
    page.getByText("4096 × 2731 · Full photo, no crop", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Post content", { exact: true })
    .fill("A landscape with room for every detail.");
  await page.getByRole("button", { name: "Share moment", exact: true }).click();
  await expect(page).toHaveURL(/\/post\//);
  await page.reload();
  const photo = page.getByRole("img", {
    name: "A landscape with room for every detail.",
    exact: true,
  });
  await expect(photo).toBeVisible();
  await expect
    .poll(() =>
      photo.evaluate((el) => ({
        width: (el as HTMLImageElement).naturalWidth,
        height: (el as HTMLImageElement).naturalHeight,
      })),
    )
    .toEqual({ width: 4096, height: 2731 });
});

test("short videos preview and persist with native controls and no autoplay", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/create");
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Video", exact: true }).click();
  await (await picker).setFiles("e2e/fixtures/short-video.mp4");
  await expect(page.getByText(/0:02.*Sound starts muted/)).toBeVisible();
  const preview = page.locator("video").first();
  await expect
    .poll(() =>
      preview.evaluate((v) => {
        const video = v as HTMLVideoElement;
        return video.readyState >= 2;
      }),
    )
    .toBeTruthy();
  expect(
    await preview.evaluate((v) => ({
      paused: (v as HTMLVideoElement).paused,
      muted: (v as HTMLVideoElement).muted,
      controls: (v as HTMLVideoElement).controls,
    })),
  ).toEqual({ paused: true, muted: true, controls: true });
  await preview.evaluate((v) => (v as HTMLVideoElement).play());
  await expect
    .poll(() => preview.evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0);
  await page
    .getByLabel("Post content", { exact: true })
    .fill("A tiny video from our day.");
  await page.getByRole("button", { name: "Share moment", exact: true }).click();
  await expect(page).toHaveURL(/\/post\//);
  await page.reload();
  const published = page.locator("video").first();
  await expect
    .poll(() =>
      published.evaluate((v) => {
        const video = v as HTMLVideoElement;
        return video.readyState >= 2 && video.duration > 0;
      }),
    )
    .toBeTruthy();
  expect(await published.evaluate((v) => (v as HTMLVideoElement).paused)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test("a video longer than one minute previews, publishes, and survives reload", async ({
  page,
}) => {
  await page.goto("/create");
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Video", exact: true }).click();
  await (await picker).setFiles("e2e/fixtures/too-long-video.mp4");
  await expect(page.getByText(/1:01.*Sound starts muted/)).toBeVisible();
  await page
    .getByLabel("Post content", { exact: true })
    .fill("A longer video from our day.");
  await page.getByRole("button", { name: "Share moment", exact: true }).click();
  await expect(page).toHaveURL(/\/post\//);
  await page.reload();
  await expect
    .poll(() =>
      page
        .locator("video")
        .first()
        .evaluate((v) => (v as HTMLVideoElement).duration),
    )
    .toBeGreaterThan(60);
});

test("the browser rejects videos over ten minutes using their real duration", async ({
  page,
}) => {
  await page.goto("/create");
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Video", exact: true }).click();
  await (await picker).setFiles("e2e/fixtures/over-ten-minutes.mp4");
  await expect(
    page.getByText("Please choose a video up to 10 minutes long.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove media", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Share moment", exact: true }),
  ).toBeDisabled();
});
