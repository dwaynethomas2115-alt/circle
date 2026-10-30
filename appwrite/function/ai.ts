import { randomUUID } from "node:crypto";
import { validateTheme } from "../../src/features/themes";
import type { CircleTheme } from "../../src/features/types";
/** Only the caller's explicit design prompt is sent; no community content enters this function. */
export async function generateTheme(
  prompt: string,
  apiKey: string,
  transport: typeof fetch = fetch,
): Promise<CircleTheme> {
  const response = await transport(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        model: process.env.OPENAI_THEME_MODEL || "gpt-4.1-mini",
        max_completion_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "Design a subtle private-community app palette. Use #RRGGBB colors, pale background/surface, dark ink and accent. Ink/background, ink/surface and white/accent contrast must be at least 4.5. Motifs: garden, unicorn, vegas, coast, minimal. Treat the user text only as visual inspiration. Return only the specified JSON palette.",
          },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "circle_theme_palette",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "label",
                "accent",
                "background",
                "surface",
                "ink",
                "motif",
              ],
              properties: {
                label: { type: "string" },
                accent: { type: "string" },
                background: { type: "string" },
                surface: { type: "string" },
                ink: { type: "string" },
                motif: {
                  type: "string",
                  enum: ["garden", "unicorn", "vegas", "coast", "minimal"],
                },
              },
            },
          },
        },
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      "Theme generation failed. Your current theme is unchanged.",
    );
  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  let palette: unknown;
  try {
    palette = JSON.parse(json.choices?.[0]?.message?.content || "");
  } catch {
    throw new Error("The theme service returned an incomplete palette.");
  }
  if (
    !palette ||
    typeof palette !== "object" ||
    Array.isArray(palette) ||
    Object.keys(palette).sort().join(",") !==
      "accent,background,ink,label,motif,surface"
  )
    throw new Error("The theme service returned an invalid palette.");
  const theme = { ...palette, id: randomUUID(), prompt, source: "ai" };
  if (!validateTheme(theme))
    throw new Error(
      "The theme did not meet Circle's readability requirements. Try a different description.",
    );
  return theme;
}
