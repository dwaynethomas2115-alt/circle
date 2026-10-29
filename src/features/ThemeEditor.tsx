import React, { useEffect, useRef, useState } from "react";
import { View, Pressable } from "react-native";
import {
  Check,
  Palette,
  Sparkles,
  WandSparkles,
  LockKeyhole,
} from "lucide-react-native";
import { useCircle } from "../state/CircleProvider";
import { T, Card, Button, Field, Banner } from "../ui/primitives";
import { font, colors } from "../ui/theme";
import { useCircleFeatures } from "./CircleFeaturesProvider";
import { defaultTheme, presetThemes, validateTheme } from "./themes";
import { CircleThemeProvider, themeTint } from "./theme-context";
import { ThemeDecoration } from "./ThemeDecoration";
import type { CircleTheme } from "./types";

/** Field order is fixed so refreshed row objects do not become editor changes. */
function themeSignature(theme: CircleTheme) {
  return JSON.stringify({
    id: theme.id,
    label: theme.label,
    prompt: theme.prompt,
    accent: theme.accent,
    background: theme.background,
    surface: theme.surface,
    ink: theme.ink,
    motif: theme.motif,
    source: theme.source,
  });
}

export function ThemeEditor({ circleId }: { circleId: string }) {
  const { state, user, mode } = useCircle();
  const { themes, actions } = useCircleFeatures();
  const saved = themes[circleId] || defaultTheme;
  const [draft, setDraft] = useState<CircleTheme>(saved);
  const [prompt, setPrompt] = useState(saved.prompt);
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [notice, setNotice] = useState("");
  const [externalChange, setExternalChange] = useState(false);
  const savedSignature = themeSignature(saved);
  const baseline = useRef({ circleId, signature: savedSignature });
  const edits = useRef({ draft, prompt });
  edits.current = { draft, prompt };
  const scope = useRef(circleId);
  scope.current = circleId;
  const submitted = useRef<string | null>(null);
  const membership = state.members.find(
    (member) => member.circleId === circleId && member.userId === user?.id,
  );
  const canManage =
    !!membership && ["owner", "admin"].includes(membership.role);
  useEffect(() => {
    const incoming: CircleTheme = JSON.parse(savedSignature);
    const previous = baseline.current;
    baseline.current = { circleId, signature: savedSignature };
    if (previous.circleId !== circleId) {
      setDraft(incoming);
      setPrompt(incoming.prompt);
      setNotice("");
      setExternalChange(false);
      setBusy(null);
      submitted.current = null;
      return;
    }
    if (previous.signature === savedSignature) return;
    const current = edits.current;
    const draftSignature = themeSignature(current.draft);
    const previousSaved: CircleTheme = JSON.parse(previous.signature);
    const dirty =
      draftSignature !== previous.signature ||
      current.prompt !== previousSaved.prompt;
    const ownSave = submitted.current === savedSignature;
    if (ownSave) {
      submitted.current = null;
      setExternalChange(false);
      return;
    }
    if (dirty) {
      if (
        draftSignature === savedSignature &&
        current.prompt === incoming.prompt
      ) {
        setExternalChange(false);
      } else {
        setExternalChange(true);
        setNotice(
          "This Circle’s theme changed elsewhere. Your unsaved preview and description are still here. You can keep editing or use the current Circle theme.",
        );
      }
      return;
    }
    setDraft(incoming);
    setPrompt(incoming.prompt);
    setExternalChange(false);
  }, [circleId, savedSignature]);
  if (!canManage)
    return (
      <Card style={{ padding: 22, gap: 12 }}>
        <LockKeyhole size={22} color={colors.muted} />
        <T style={{ fontFamily: font.bold }}>A space shaped by your Circle.</T>
        <T style={{ color: colors.muted, lineHeight: 21 }}>
          Circle owners and admins can change the theme.
        </T>
      </Card>
    );

  async function generate() {
    if (busy || !prompt.trim()) return;
    const requestedCircle = circleId;
    setBusy("preview");
    setNotice("");
    try {
      const result = await actions.generateTheme(circleId, prompt.trim());
      if (scope.current !== requestedCircle) return;
      if (result.ok && result.theme && validateTheme(result.theme)) {
        setDraft(result.theme);
        setNotice(
          mode === "demo"
            ? "Your prompt matched a curated demo preset. Preview it below, then apply when you’re happy."
            : "Your theme preview is ready. Review it below before applying.",
        );
      } else
        setNotice(
          result.error ||
            "That theme could not be previewed. Try another prompt or choose a preset.",
        );
    } catch {
      if (scope.current !== requestedCircle) return;
      setNotice(
        "Could not preview this theme. Your current theme is unchanged.",
      );
    } finally {
      if (scope.current === requestedCircle) setBusy(null);
    }
  }
  async function save() {
    if (busy) return;
    const requestedCircle = circleId;
    const signature = themeSignature(draft);
    submitted.current =
      signature === baseline.current.signature ? null : signature;
    setBusy("save");
    setNotice("");
    try {
      const result = await actions.saveTheme(circleId, draft);
      if (scope.current !== requestedCircle) return;
      if (!result.ok) submitted.current = null;
      else setExternalChange(false);
      setNotice(
        result.ok
          ? "A fresh little feeling. Your Circle theme is saved."
          : result.error || "Your theme could not be saved. Please try again.",
      );
    } catch {
      if (scope.current !== requestedCircle) return;
      submitted.current = null;
      setNotice("Your theme could not be saved. Please try again.");
    } finally {
      if (scope.current === requestedCircle) setBusy(null);
    }
  }
  return (
    <View style={{ gap: 20 }}>
      <Card style={{ padding: 24, gap: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 13,
              backgroundColor: themeTint(saved.accent),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Palette size={20} color={saved.accent} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <T style={{ fontFamily: font.heading, fontSize: 19 }}>
              Make it feel like your Circle
            </T>
            <T style={{ color: colors.muted, lineHeight: 20, fontSize: 12 }}>
              Thoughtful colors. A little personality. Always easy to read.
            </T>
          </View>
        </View>
        <T style={{ fontFamily: font.bold, fontSize: 12 }}>
          CHOOSE A STARTING POINT
        </T>
        {externalChange && (
          <View style={{ alignItems: "flex-start", gap: 8 }}>
            <T style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
              Current Circle theme: {saved.label}. Your preview has not been
              overwritten.
            </T>
            <Button
              secondary
              disabled={!!busy}
              onPress={() => {
                setDraft(saved);
                setPrompt(saved.prompt);
                setExternalChange(false);
                setNotice("");
              }}
            >
              Use current Circle theme
            </Button>
          </View>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {presetThemes.map((theme) => {
            const selected = draft.id === theme.id && draft.source === "preset";
            return (
              <Pressable
                key={theme.id}
                accessibilityRole="radio"
                disabled={!!busy}
                accessibilityState={{ checked: selected, disabled: !!busy }}
                aria-checked={selected}
                accessibilityLabel={theme.label}
                onPress={() => {
                  setDraft({ ...theme });
                  setPrompt(theme.prompt);
                  setNotice("");
                }}
                style={({ pressed }) => ({
                  flexGrow: 1,
                  flexBasis: 124,
                  maxWidth: 200,
                  padding: 11,
                  gap: 10,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? theme.accent : colors.line,
                  borderRadius: 14,
                  backgroundColor: theme.surface,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <View
                  style={{
                    height: 48,
                    backgroundColor: theme.background,
                    borderRadius: 8,
                    overflow: "hidden",
                    justifyContent: "center",
                    paddingHorizontal: 10,
                  }}
                >
                  <ThemeDecoration theme={theme} compact />
                  <View style={{ flexDirection: "row", gap: 5 }}>
                    {[theme.accent, theme.ink, theme.background].map(
                      (color, index) => (
                        <View
                          key={index}
                          style={{
                            height: 17,
                            width: 17,
                            borderRadius: 9,
                            backgroundColor: color,
                            borderWidth: 1,
                            borderColor: "#0000000D",
                          }}
                        />
                      ),
                    )}
                  </View>
                  {selected && (
                    <View
                      style={{
                        position: "absolute",
                        right: 7,
                        top: 7,
                        backgroundColor: theme.accent,
                        padding: 3,
                        borderRadius: 12,
                      }}
                    >
                      <Check size={12} color="white" />
                    </View>
                  )}
                </View>
                <T
                  style={{
                    color: theme.ink,
                    fontFamily: font.bold,
                    fontSize: 11,
                  }}
                >
                  {theme.label}
                </T>
              </Pressable>
            );
          })}
        </View>
        <View style={{ height: 1, backgroundColor: colors.line }} />
        <View style={{ gap: 5 }}>
          <T style={{ fontFamily: font.bold, fontSize: 14 }}>
            Or, describe the feeling
          </T>
          <T style={{ fontSize: 12, color: colors.muted, lineHeight: 19 }}>
            {mode === "demo"
              ? "Local demo: your words select one of the curated presets above. No AI is called."
              : "AI suggests an accessible color palette and a small decorative motif. Preview it before applying."}
          </T>
        </View>
        <Field
          label="Theme description"
          editable={!busy}
          placeholder="Pink unicorns for Anastasia, or an emerald Vegas weekend…"
          value={prompt}
          onChangeText={setPrompt}
          multiline
          maxLength={300}
          style={{ minHeight: 88 }}
        />
        <View style={{ alignItems: "flex-start", marginTop: -14 }}>
          <Button
            secondary
            disabled={!!busy || !prompt.trim()}
            icon={WandSparkles}
            onPress={() => {
              void generate();
            }}
          >
            {busy === "preview"
              ? "Finding the feeling…"
              : "Preview from description"}
          </Button>
        </View>
      </Card>
      {!!notice && <Banner text={notice} onDismiss={() => setNotice("")} />}
      <View style={{ gap: 12 }}>
        <T style={{ fontFamily: font.bold, fontSize: 12, letterSpacing: 1 }}>
          YOUR CIRCLE, REIMAGINED
        </T>
        <CircleThemeProvider theme={draft}>
          <View
            style={{
              borderRadius: 20,
              backgroundColor: draft.background,
              borderWidth: 1,
              borderColor: themeTint(draft.accent, 0.18),
              padding: 24,
              overflow: "hidden",
              gap: 18,
            }}
          >
            <ThemeDecoration theme={draft} />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 14,
              }}
            >
              <View style={{ gap: 5, flex: 1 }}>
                <T
                  style={{
                    color: draft.accent,
                    fontSize: 10,
                    fontFamily: font.bold,
                    letterSpacing: 1.5,
                  }}
                >
                  A SPACE TO BELONG
                </T>
                <T style={{ fontFamily: font.heading, fontSize: 23 }}>
                  {state.circles.find((circle) => circle.id === circleId)
                    ?.name || "Your Circle"}
                </T>
              </View>
              <Sparkles size={21} color={draft.accent} />
            </View>
            <Card style={{ padding: 18, gap: 11 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 16,
                    backgroundColor: themeTint(draft.accent, 0.13),
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <T style={{ fontFamily: font.bold, color: draft.accent }}>
                    {user?.name.charAt(0) || "Y"}
                  </T>
                </View>
                <T style={{ fontFamily: font.bold, fontSize: 12 }}>
                  {user?.name || "Your people"}
                </T>
              </View>
              <T style={{ lineHeight: 22 }}>
                Here’s to all the little moments we get to share together.
              </T>
              <View
                style={{ height: 1, backgroundColor: themeTint(draft.accent) }}
              />
              <T style={{ color: draft.accent, fontSize: 11 }}>
                A little closer, together.
              </T>
            </Card>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <Button
                icon={Check}
                disabled={!!busy}
                onPress={() => {
                  void save();
                }}
              >
                {busy === "save" ? "Saving theme…" : "Apply to this Circle"}
              </Button>
              <T style={{ color: draft.ink, opacity: 0.6, fontSize: 11 }}>
                {draft.source === "ai"
                  ? "AI palette · preview"
                  : "Curated preset · preview"}
              </T>
            </View>
          </View>
        </CircleThemeProvider>
        <T style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}>
          Only this Circle changes. Your Home feed and other Circles keep their
          own atmosphere.
        </T>
      </View>
    </View>
  );
}
