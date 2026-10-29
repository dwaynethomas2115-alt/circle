import { test, expect } from "@playwright/test";
test.use({
  permissions: ["camera", "microphone"],
  launchOptions: {
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
test("local room clearly previews only this device and releases capture on stop and exit", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const records: MediaStream[] = [];
    (
      window as unknown as { circleTestStreams: MediaStream[] }
    ).circleTestStreams = records;
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      records.push(stream);
      return stream;
    };
  });
  await page.goto("/circle/football?tab=chat");
  await page.getByRole("button", { name: "Join room", exact: true }).click();
  await expect(
    page.getByText("No remote participants or live presence are simulated.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Join Circle room", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Preview camera", exact: true })
    .click();
  const camera = page.locator('video[aria-label="Your local camera preview"]');
  await expect
    .poll(() => camera.evaluate((el) => (el as HTMLVideoElement).videoWidth))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Preview mic", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { circleTestStreams: MediaStream[] }
        ).circleTestStreams.some((s) =>
          s.getAudioTracks().some((t) => t.readyState === "live"),
        ),
      ),
    )
    .toBeTruthy();
  await page.getByRole("button", { name: "Stop preview", exact: true }).click();
  const allStopped = () =>
    page.evaluate(() =>
      (
        window as unknown as { circleTestStreams: MediaStream[] }
      ).circleTestStreams.every((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    );
  await expect.poll(allStopped).toBeTruthy();
  await page
    .getByRole("button", { name: "Preview camera", exact: true })
    .click();
  await expect
    .poll(() => camera.evaluate((el) => (el as HTMLVideoElement).videoWidth))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Close room", exact: true }).click();
  await expect(camera).toHaveCount(0);
  await expect.poll(allStopped).toBeTruthy();
  await expect(
    page.getByRole("tab", { name: "Chat", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByLabel("Message your Circle", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Highlights", exact: true }).click();
  await page.getByRole("button", { name: "Join room", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview camera", exact: true })
    .click();
  await expect
    .poll(() => camera.evaluate((el) => (el as HTMLVideoElement).videoWidth))
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Back to Circle", exact: true })
    .click();
  await expect(camera).toHaveCount(0);
  await expect.poll(allStopped).toBeTruthy();
  await expect(
    page.getByRole("tab", { name: "Highlights", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByText("Your Circle’s Highlights.", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
