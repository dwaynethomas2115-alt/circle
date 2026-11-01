const PRODUCTION_ORIGIN = "https://circle-rho-smoky.vercel.app";

/** Existing demo codes and production bearer tokens both remain supported. */
export function normalizeInvitationCode(value: unknown): string {
  if (typeof value !== "string") return "";
  const code = value.trim();
  return /^[A-Za-z0-9]{1,128}$/.test(code) ? code.toUpperCase() : "";
}

function safeOrigin(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return;
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    )
      return;
    return url.origin;
  } catch {
    return;
  }
}

function appOrigin(base?: string): string {
  return (
    safeOrigin(base) ||
    safeOrigin(process.env.EXPO_PUBLIC_WEB_APP_URL) ||
    (typeof window !== "undefined"
      ? safeOrigin(window.location?.origin)
      : undefined) ||
    PRODUCTION_ORIGIN
  );
}

export function buildCircleAppUrl(base?: string): string {
  return `${appOrigin(base)}/welcome`;
}

export function buildCircleInviteUrl(code: string, base?: string): string {
  const normalized = normalizeInvitationCode(code);
  if (!normalized) throw new Error("This invitation code is invalid.");
  // Fragments are not sent to the web server or included in HTTP referrers.
  return `${appOrigin(base)}/join#invite=${encodeURIComponent(normalized)}`;
}

export function invitationCodeFromFragment(value: unknown): string {
  if (typeof value !== "string" || value.length > 1024) return "";
  const fragment = value.startsWith("#") ? value.slice(1) : value;
  const params = new URLSearchParams(fragment);
  if (Array.from(params.keys()).length !== 1 || !params.has("invite"))
    return "";
  const code = params.get("invite");
  // URL values containing whitespace/control characters are malformed links.
  if (!code || code !== code.trim()) return "";
  return normalizeInvitationCode(code);
}

/** Accept a raw private code or an invite link for this app, never another site. */
export function invitationCodeFromUrl(value: unknown, base?: string): string {
  const raw = normalizeInvitationCode(value);
  if (raw) return raw;
  if (typeof value !== "string" || value.length > 2048) return "";
  try {
    const url = new URL(value.trim(), appOrigin(base));
    if (
      url.origin !== appOrigin(base) ||
      url.username ||
      url.password ||
      !["/join", "/join/"].includes(url.pathname) ||
      url.search
    )
      return "";
    return invitationCodeFromFragment(url.hash);
  } catch {
    return "";
  }
}

export function invitationJoinRoute(code: unknown) {
  const normalized = normalizeInvitationCode(code);
  return normalized
    ? (`/join#invite=${normalized}` as const)
    : ("/join" as const);
}

export function invitationAuthFragment(
  mode: "signin" | "signup",
  code: unknown,
) {
  const normalized = normalizeInvitationCode(code);
  const safeMode = mode === "signup" ? "signup" : "signin";
  return `${normalized ? `invite=${normalized}&` : ""}mode=${safeMode}&next=join`;
}

export function invitationAuthContext(value: unknown) {
  if (typeof value !== "string" || value.length > 1024) return null;
  const params = new URLSearchParams(
    value.startsWith("#") ? value.slice(1) : value,
  );
  const keys = Array.from(params.keys());
  if (
    keys.some((key) => !["invite", "mode", "next"].includes(key)) ||
    new Set(keys).size !== keys.length ||
    params.get("next") !== "join" ||
    !["signin", "signup"].includes(params.get("mode") || "")
  )
    return null;
  const rawCode = params.get("invite");
  const code = rawCode === null ? "" : normalizeInvitationCode(rawCode);
  if (rawCode !== null && (!code || rawCode !== rawCode.trim())) return null;
  return {
    next: "join" as const,
    mode: params.get("mode") as "signin" | "signup",
    code,
  };
}

export function invitationAuthRoute(mode: "signin" | "signup", code: unknown) {
  // Expo Router's object-href encoder treats '#' as an ordinary query key.
  // Its web startup also appends a query after a hash on reload. Keep all
  // invitation auth context in one validated fragment, without any query.
  return `/auth#${invitationAuthFragment(mode, code)}` as const;
}

/** An invitation can return only to our generic join page, never an arbitrary URL. */
export function invitationAuthReturn(next: unknown, fragment: unknown) {
  const context = invitationAuthContext(fragment);
  return next === "join" && context
    ? invitationJoinRoute(context.code)
    : ("/" as const);
}
