export interface ShareLinkContent {
  title: string;
  message: string;
  url: string;
}
export type ShareLinkResult = "shared" | "copied" | "cancelled" | "manual";
export interface BrowserSharing {
  share?: (data: { title: string; text: string; url: string }) => Promise<void>;
  clipboard?: { writeText: (value: string) => Promise<void> };
}
const currentBrowser = (): BrowserSharing | undefined =>
  typeof navigator === "undefined" ? undefined : navigator;

/** Copy only after a deliberate user action; denied access leaves a manual link. */
export async function copyLink(
  url: string,
  browser: BrowserSharing | undefined = currentBrowser(),
): Promise<ShareLinkResult> {
  try {
    if (!browser?.clipboard?.writeText) return "manual";
    await browser.clipboard.writeText(url);
    return "copied";
  } catch {
    return "manual";
  }
}

/** Open the system chooser when available; never send to a recipient ourselves. */
export async function shareLink(
  content: ShareLinkContent,
  browser: BrowserSharing | undefined = currentBrowser(),
): Promise<ShareLinkResult> {
  if (browser?.share) {
    try {
      await browser.share({
        title: content.title,
        text: content.message,
        url: content.url,
      });
      return "shared";
    } catch (cause) {
      if ((cause as { name?: string } | null)?.name === "AbortError")
        return "cancelled";
    }
  }
  return copyLink(content.url, browser);
}
