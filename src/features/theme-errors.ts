interface ThemeErrorDetail {
  error?: unknown;
  code?: unknown;
  retryAfterSeconds?: unknown;
  resetAt?: unknown;
}

/** Keep server quota timing separate from provider failures and daily limits. */
export class ThemeGenerationError extends Error {
  readonly code?: string;
  readonly retryAfterSeconds?: number;
  readonly resetAt?: string;

  constructor(
    status: number,
    value: unknown,
    retryAfter: string | null = null,
  ) {
    const detail: ThemeErrorDetail =
      value && typeof value === "object" ? value : {};
    const code = typeof detail.code === "string" ? detail.code : undefined;
    const retry = Number(detail.retryAfterSeconds ?? retryAfter);
    const seconds =
      Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : undefined;
    const resetAt =
      typeof detail.resetAt === "string" &&
      Number.isFinite(Date.parse(detail.resetAt))
        ? detail.resetAt
        : undefined;
    const supplied =
      typeof detail.error === "string" ? detail.error : undefined;
    let fallback = "Theme generation is unavailable. Please try again.";
    if (status === 401)
      fallback =
        "Your sign-in expired or belongs to a different Supabase project. Sign out and back in, then try again.";
    else if (status === 404)
      fallback =
        "The generate-circle-theme function is not deployed in this Supabase project yet. Follow the OpenAI setup guide.";
    else if (code === "theme_daily_limit")
      fallback =
        "You’ve reached your daily wallpaper generation limit. Try again when the daily allowance resets.";
    else if (code === "theme_in_progress")
      fallback =
        "A wallpaper is already being generated. Let it finish before trying again.";
    else if (status === 429)
      fallback = seconds
        ? `Wallpaper generation is busy. Try again in ${seconds} seconds.`
        : "Wallpaper generation is busy. Please try again later.";
    const resetMessage =
      code === "theme_daily_limit" && resetAt
        ? ` You can generate again after ${new Date(resetAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`
        : "";
    super((supplied || fallback) + resetMessage);
    this.name = "ThemeGenerationError";
    this.code = code;
    this.retryAfterSeconds = seconds;
    this.resetAt = resetAt;
  }
}
