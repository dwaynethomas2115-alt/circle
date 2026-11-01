import { Share } from "react-native";
import type { ShareLinkContent, ShareLinkResult } from "./share";

export async function copyLink(_url: string): Promise<ShareLinkResult> {
  // Native long-press selection is available without adding a clipboard package.
  return "manual";
}

export async function shareLink(
  content: ShareLinkContent,
): Promise<ShareLinkResult> {
  try {
    const result = await Share.share({
      title: content.title,
      message: `${content.message}\n${content.url}`,
    });
    return result.action === Share.dismissedAction ? "cancelled" : "shared";
  } catch {
    return "manual";
  }
}
