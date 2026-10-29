import type { CircleTheme } from "./types";

/** Curated, accessible light palettes. Demo prompts choose from these presets. */
export const presetThemes: CircleTheme[] = [
  {
    id: "garden",
    label: "Garden gathering",
    prompt: "A calm garden, soft sage greens and room to breathe.",
    accent: "#137F70",
    background: "#F7F8F7",
    surface: "#FFFFFF",
    ink: "#203B39",
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
  const words = prompt.trim().slice(0, 300);
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
  if (
    Object.keys(theme).length !== keys.length ||
    !Object.keys(theme).every((key) => keys.includes(key))
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
  if (typeof theme.prompt !== "string" || theme.prompt.length > 300)
    return false;
  if (
    !["garden", "unicorn", "vegas", "coast", "minimal"].includes(
      String(theme.motif),
    )
  )
    return false;
  if (theme.source !== "preset" && theme.source !== "ai") return false;
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
