import { buildCircleAppUrl } from "./inviteLinks";

export type RecoveryCredentials = { userId: string; secret: string };
type RecoveryAccount = {
  createRecovery: (input: { email: string; url: string }) => Promise<unknown>;
  updateRecovery: (
    input: RecoveryCredentials & { password: string },
  ) => Promise<unknown>;
};
type RecoveryResult = { ok: boolean; message: string };

export const RECOVERY_EMAIL_MESSAGE =
  "If an account uses that email, you’ll receive a password reset link. Check your inbox and spam folder.";

/** Appwrite supplies these values in its email redirect. Keep them in memory only. */
export function recoveryCredentials(params: {
  userId?: unknown;
  secret?: unknown;
}): RecoveryCredentials | null {
  const { userId, secret } = params;
  if (
    typeof userId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(userId) ||
    typeof secret !== "string" ||
    !secret ||
    secret.length > 2048 ||
    /\s/.test(secret)
  )
    return null;
  return { userId, secret };
}

export function passwordRecoveryUrl(base?: string): string {
  const url = new URL(buildCircleAppUrl(base));
  url.pathname = "/auth";
  url.search = "?mode=reset";
  return url.toString();
}

function errorCode(error: unknown): number | undefined {
  return error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "number"
    ? error.code
    : undefined;
}

export async function requestPasswordRecovery(
  account: Pick<RecoveryAccount, "createRecovery">,
  email: string,
  url: string,
): Promise<RecoveryResult> {
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 320)
    return { ok: false, message: "Enter your email address first." };
  try {
    await account.createRecovery({ email: trimmed, url });
    return { ok: true, message: RECOVERY_EMAIL_MESSAGE };
  } catch (error) {
    // Unknown accounts get the same public response; never render provider errors.
    if (errorCode(error) === 404)
      return { ok: true, message: RECOVERY_EMAIL_MESSAGE };
    return {
      ok: false,
      message:
        errorCode(error) === 429
          ? "Too many reset requests. Wait a little before trying again."
          : "We couldn’t request a reset email. Check your connection and try again.",
    };
  }
}

export async function completePasswordRecovery(
  account: Pick<RecoveryAccount, "updateRecovery">,
  credentials: RecoveryCredentials | null,
  password: string,
  confirmation: string,
): Promise<RecoveryResult> {
  if (!credentials || !recoveryCredentials(credentials))
    return {
      ok: false,
      message: "This reset link is incomplete. Request a new one.",
    };
  if (password.length < 8 || password.length > 256)
    return {
      ok: false,
      message: "Use a password between 8 and 256 characters.",
    };
  if (password !== confirmation)
    return { ok: false, message: "Your passwords don’t match yet." };
  try {
    await account.updateRecovery({ ...credentials, password });
    return {
      ok: true,
      message: "Your password has been reset. Sign in with your new password.",
    };
  } catch (error) {
    return {
      ok: false,
      message: [401, 404].includes(errorCode(error) || 0)
        ? "This reset link has expired or has already been used. Request a new one."
        : errorCode(error) === 429
          ? "Too many attempts. Wait a little before trying again."
          : "We couldn’t reset your password. Check your connection and password requirements, or request a new link.",
    };
  }
}
