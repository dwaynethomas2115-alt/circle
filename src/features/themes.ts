import type { CircleTheme } from "./types";

export const THEME_PROMPT_MAX_LENGTH = 1_000;

/** Logical paths describe a generated asset, never an arbitrary storage URL. */
function wallpaperReference(
  path: unknown,
): { circleId: string; bucketId: string; fileId: string } | undefined {
  if (typeof path !== "string") return undefined;
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const match = new RegExp(
    `^([A-Za-z0-9_-]{1,128})/(${uuid})\\.(jpg|webp)$`,
    "i",
  ).exec(path);
  if (!match || match[0] !== path) return undefined;
  const id = match[2].toLowerCase();
  return {
    circleId: match[1],
    bucketId:
      match[3].toLowerCase() === "jpg" ? "circle-media" : "circle-wallpapers",
    fileId:
      match[3].toLowerCase() === "jpg" ? `wp_${id.replace(/-/g, "")}` : id,
  };
}

/** Private storage identifiers only. Theme JSON cannot supply arbitrary URLs. */
export function wallpaperCircleId(path: unknown): string | undefined {
  return wallpaperReference(path)?.circleId;
}

/** Bind a server-issued token URL to this exact wallpaper and Appwrite project. */
export function wallpaperUrlMatchesPath(
  value: unknown,
  wallpaperPath: unknown,
  endpoint: string | undefined,
  projectId: string | undefined,
): value is string {
  const asset = wallpaperReference(wallpaperPath);
  if (!asset || typeof value !== "string" || !endpoint || !projectId)
    return false;
  if (value !== value.trim() || /[\r\n\t#]/.test(value)) return false;
  try {
    const configured = new URL(endpoint);
    const image = new URL(value);
    if (
      configured.protocol !== "https:" ||
      configured.username ||
      configured.password ||
      configured.search ||
      configured.hash ||
      image.protocol !== "https:" ||
      image.origin !== configured.origin ||
      image.username ||
      image.password ||
      image.hash ||
      image.pathname !==
        `${configured.pathname.replace(/\/$/, "")}/storage/buckets/${asset.bucketId}/files/${asset.fileId}/view` ||
      image.searchParams.getAll("project").length !== 1 ||
      image.searchParams.get("project") !== projectId ||
      image.searchParams.getAll("token").length !== 1 ||
      !image.searchParams.get("token")
    )
      return false;
    let unknownParameter = false;
    image.searchParams.forEach((_entry, key) => {
      if (key !== "project" && key !== "token") unknownParameter = true;
    });
    return !unknownParameter;
  } catch {
    return false;
  }
}

/** Curated, accessible light palettes. Demo prompts choose from these presets. */
export const presetThemes: CircleTheme[] = [
  {
    id: "garden",
    label: "Garden gathering",
    prompt: "A calm garden, soft sage greens and room to breathe.",
    accent: "#287663",
    background: "#F7F5F0",
    surface: "#FFFFFF",
    ink: "#263B36",
    motif: "garden",
    source: "preset",
  },
  {
    id: "unicorn",
    label: "A little magic",
    prompt:
      "Pink unicorns, soft blush, tiny stars and a little everyday magic.",
    accent: "#A43E78",
    background: "#FFF5FA",
    surface: "#FFFCFE",
    ink: "#493044",
    motif: "unicorn",
    source: "preset",
  },
  {
    id: "vegas",
    label: "The Vegas weekend",
    prompt:
      "An elegant Vegas trip: emerald, champagne gold and a playful card-table detail.",
    accent: "#22634F",
    background: "#F5F5ED",
    surface: "#FFFDF6",
    ink: "#233F35",
    motif: "vegas",
    source: "preset",
  },
  {
    id: "coast",
    label: "By the coast",
    prompt:
      "A breezy coast with sea-glass blues, warm white and soft ocean waves.",
    accent: "#246C94",
    background: "#F0F7FA",
    surface: "#FBFEFF",
    ink: "#244251",
    motif: "coast",
    source: "preset",
  },
  {
    id: "minimal",
    label: "Quietly simple",
    prompt:
      "Minimal and considered. Crisp linen, slate and no extra decoration.",
    accent: "#4A5968",
    background: "#F5F6F8",
    surface: "#FFFFFF",
    ink: "#2B3744",
    motif: "minimal",
    source: "preset",
  },
];

export const defaultTheme = presetThemes[0];

/** This is deliberately deterministic, not a claim of AI generation. */
export function themeFromPrompt(prompt: string): CircleTheme {
  const words = prompt.trim().slice(0, THEME_PROMPT_MAX_LENGTH);
  const normalized = words.toLowerCase();
  const motif = /unicorn|pink|blush|magic|fairy|sparkle|princess/.test(
    normalized,
  )
    ? "unicorn"
    : /vegas|casino|poker|emerald|champagne|gold|cards/.test(normalized)
      ? "vegas"
      : /ocean|sea|beach|coast|blue|wave|surf|nautical/.test(normalized)
        ? "coast"
        : /minimal|slate|simple|mono|clean|linen/.test(normalized)
          ? "minimal"
          : "garden";
  return {
    ...presetThemes.find((theme) => theme.motif === motif)!,
    prompt: words,
    source: "preset",
  };
}

function luminance(color: string): number {
  const components = [1, 3, 5].map((start) => {
    const channel = parseInt(color.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (
    components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722
  );
}

function contrast(first: string, second: string): number {
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Validate model output before it can become UI styling. No CSS or markup. */
export function validateTheme(value: unknown): value is CircleTheme {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const theme = value as Record<string, unknown>;
  const keys = [
    "id",
    "label",
    "prompt",
    "accent",
    "background",
    "surface",
    "ink",
    "motif",
    "source",
  ];
  const hasWallpaper = Object.hasOwn(theme, "wallpaperPath");
  if (
    Object.keys(theme).length !== keys.length + Number(hasWallpaper) ||
    !keys.every((key) => Object.hasOwn(theme, key)) ||
    !Object.keys(theme).every(
      (key) => keys.includes(key) || key === "wallpaperPath",
    )
  )
    return false;
  if (typeof theme.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(theme.id))
    return false;
  if (
    typeof theme.label !== "string" ||
    theme.label.trim().length < 3 ||
    theme.label.length > 60
  )
    return false;
  if (
    typeof theme.prompt !== "string" ||
    theme.prompt.length > THEME_PROMPT_MAX_LENGTH
  )
    return false;
  if (
    !["garden", "unicorn", "vegas", "coast", "minimal"].includes(
      String(theme.motif),
    )
  )
    return false;
  if (theme.source !== "preset" && theme.source !== "ai") return false;
  if (
    hasWallpaper &&
    (theme.source !== "ai" || !wallpaperCircleId(theme.wallpaperPath))
  )
    return false;
  const fields = ["accent", "background", "surface", "ink"] as const;
  if (
    !fields.every(
      (key) =>
        typeof theme[key] === "string" &&
        /^#[\dA-Fa-f]{6}$/.test(theme[key] as string),
    )
  )
    return false;
  const { accent, background, surface, ink } = theme as unknown as CircleTheme;
  return (
    luminance(background) >= 0.8 &&
    luminance(surface) >= 0.85 &&
    contrast(accent, "#FFFFFF") >= 4.5 &&
    contrast(ink, background) >= 4.5 &&
    contrast(ink, surface) >= 4.5
  );
}

/** Legacy palettes remain readable, but a new AI generation must include art. */
export function validateGeneratedWallpaper(
  value: unknown,
  circleId: string,
): value is CircleTheme & { wallpaperPath: string } {
  return (
    validateTheme(value) &&
    value.source === "ai" &&
    wallpaperCircleId(value.wallpaperPath) === circleId
  );
}
