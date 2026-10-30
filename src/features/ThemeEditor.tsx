import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  Check,
  LockKeyhole,
  Sparkles,
  WandSparkles,
} from "lucide-react-native";
import { useCircle } from "../state/CircleProvider";
import { T, Card, Button, Field, Banner } from "../ui/primitives";
import { font, colors } from "../ui/theme";
import { useCircleFeatures } from "./CircleFeaturesProvider";
import { defaultTheme, validateTheme } from "./themes";
import {
  CircleThemeProvider,
  themeTint,
  useCircleWallpaper,
} from "./theme-context";
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
    ...(theme.wallpaperPath ? { wallpaperPath: theme.wallpaperPath } : {}),
  });
}
const initialPrompt = (theme: CircleTheme) =>
  theme.source === "ai" ? theme.prompt : "";

export function ThemeEditor({ circleId }: { circleId: string }) {
  const { state, user, mode } = useCircle();
  const { themes, actions } = useCircleFeatures();
  const saved = themes[circleId] || defaultTheme;
  const [draft, setDraft] = useState<CircleTheme>(saved);
  const [prompt, setPrompt] = useState(initialPrompt(saved));
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [notice, setNotice] = useState("");
  const [externalChange, setExternalChange] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewError, setPreviewError] = useState(false);
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
    setPreviewReady(false);
    setPreviewError(false);
  }, [draft.wallpaperPath, circleId]);

  useEffect(() => {
    const incoming: CircleTheme = JSON.parse(savedSignature);
    const previous = baseline.current;
    baseline.current = { circleId, signature: savedSignature };
    if (previous.circleId !== circleId) {
      setDraft(incoming);
      setPrompt(initialPrompt(incoming));
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
      current.prompt !== initialPrompt(previousSaved);
    if (submitted.current === savedSignature) {
      submitted.current = null;
      setExternalChange(false);
      return;
    }
    if (dirty) {
      if (
        draftSignature === savedSignature &&
        current.prompt === initialPrompt(incoming)
      ) {
        setExternalChange(false);
      } else {
        setExternalChange(true);
        setNotice(
          "This Circle’s theme changed elsewhere. Your prompt and preview are still here.",
        );
      }
      return;
    }
    setDraft(incoming);
    setPrompt(initialPrompt(incoming));
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
    if (busy || prompt.trim().length < 3) return;
    const requestedCircle = circleId;
    setBusy("preview");
    setNotice("");
    try {
      const result = await actions.generateTheme(circleId, prompt.trim());
      if (scope.current !== requestedCircle) return;
      if (
        result.ok &&
        result.theme &&
        validateTheme(result.theme) &&
        result.theme.source === "ai" &&
        result.theme.wallpaperPath
      ) {
        setDraft(result.theme);
        setNotice(
          "Your wallpaper is ready. Take a look, then make it your Circle’s theme.",
        );
      } else {
        setNotice(
          result.error ||
            "Wallpaper generation isn’t available yet. Please try again after Circle is updated.",
        );
      }
    } catch {
      if (scope.current !== requestedCircle) return;
      setNotice("Your wallpaper could not be generated. Please try again.");
    } finally {
      if (scope.current === requestedCircle) setBusy(null);
    }
  }

  async function save() {
    if (busy || !draft.wallpaperPath || !previewReady) return;
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
          ? "Your Circle has a whole new world. Theme saved."
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
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: themeTint(saved.accent),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <WandSparkles size={21} color={saved.accent} />
          </View>
          <T style={{ flex: 1, fontFamily: font.heading, fontSize: 21 }}>
            Dream up your Circle
          </T>
        </View>
        <T style={{ color: colors.muted, lineHeight: 23 }}>
          Bring your Circle to life. Describe everyone’s favorite colors,
          characters, places, and things—we’ll blend them into a colorful
          wallpaper made just for you.
        </T>
        {externalChange && (
          <View style={{ alignItems: "flex-start", gap: 8 }}>
            <T style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
              Current Circle theme: {saved.label}. Your preview is still here.
            </T>
            <Button
              secondary
              disabled={!!busy}
              onPress={() => {
                setDraft(saved);
                setPrompt(initialPrompt(saved));
                setExternalChange(false);
                setNotice("");
              }}
            >
              Use current Circle theme
            </Button>
          </View>
        )}
        <Field
          label="Theme prompt"
          editable={!busy}
          placeholder="Anastasia loves pink and Barbie, and Daelin loves tornadoes and volcanoes. Make it bright and playful…"
          value={prompt}
          onChangeText={setPrompt}
          multiline
          maxLength={1000}
          style={{ minHeight: 136, marginBottom: 0 }}
        />
        <View style={{ alignItems: "flex-start", gap: 11, marginTop: -14 }}>
          <Button
            disabled={!!busy || prompt.trim().length < 3}
            icon={WandSparkles}
            onPress={() => {
              void generate();
            }}
          >
            {busy === "preview"
              ? "Creating your wallpaper…"
              : "Generate wallpaper"}
          </Button>
          {busy === "preview" && (
            <View
              style={{ flexDirection: "row", gap: 9, alignItems: "center" }}
            >
              <ActivityIndicator size="small" color={saved.accent} />
              <T style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
                Bringing your ideas together. This can take a minute or two.
              </T>
            </View>
          )}
          {mode === "demo" && (
            <T style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
              AI wallpapers need a connected Circle backend. Local Demo doesn’t
              generate images.
            </T>
          )}
        </View>
      </Card>
      {!!notice && <Banner text={notice} onDismiss={() => setNotice("")} />}
      {!!draft.wallpaperPath && (
        <CircleThemeProvider theme={draft}>
          <WallpaperPreview
            theme={draft}
            circleName={
              state.circles.find((circle) => circle.id === circleId)?.name ||
              "Your Circle"
            }
            busy={busy}
            applied={themeSignature(draft) === savedSignature}
            outdated={prompt.trim() !== draft.prompt}
            ready={previewReady}
            imageError={previewError}
            onLoad={() => {
              if (edits.current.draft.wallpaperPath === draft.wallpaperPath) {
                setPreviewReady(true);
                setPreviewError(false);
              }
            }}
            onError={() => {
              if (edits.current.draft.wallpaperPath === draft.wallpaperPath) {
                setPreviewReady(false);
                setPreviewError(true);
              }
            }}
            onSave={() => {
              void save();
            }}
          />
        </CircleThemeProvider>
      )}
    </View>
  );
}

function WallpaperPreview({
  theme,
  circleName,
  busy,
  applied,
  outdated,
  ready,
  imageError,
  onLoad,
  onError,
  onSave,
}: {
  theme: CircleTheme;
  circleName: string;
  busy: "preview" | "save" | null;
  applied: boolean;
  outdated: boolean;
  ready: boolean;
  imageError: boolean;
  onLoad: () => void;
  onError: () => void;
  onSave: () => void;
}) {
  const wallpaper = useCircleWallpaper();
  return (
    <View style={{ gap: 12 }}>
      <T style={{ fontFamily: font.bold, fontSize: 12, letterSpacing: 1 }}>
        YOUR CIRCLE, REIMAGINED
      </T>
      <View
        testID="theme-wallpaper-preview"
        style={{
          borderRadius: 22,
          backgroundColor: theme.background,
          borderWidth: 1,
          borderColor: themeTint(theme.accent, 0.2),
          minHeight: 350,
          overflow: "hidden",
          justifyContent: "space-between",
          padding: 22,
          gap: 90,
        }}
      >
        <ThemeDecoration
          key={theme.wallpaperPath}
          onLoad={onLoad}
          onError={onError}
        />
        <View style={{ alignItems: "flex-start" }}>
          <View
            style={{
              backgroundColor: "#FFFFFFF2",
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 20,
              flexDirection: "row",
              gap: 7,
              alignItems: "center",
            }}
          >
            <Sparkles size={13} color={theme.accent} />
            <T
              style={{ color: theme.ink, fontSize: 11, fontFamily: font.bold }}
            >
              {applied
                ? "Your Circle’s wallpaper"
                : "A world made for your Circle"}
            </T>
          </View>
        </View>
        <View
          style={{
            backgroundColor: "#FFFFFFF2",
            padding: 20,
            borderRadius: 17,
            gap: 12,
          }}
        >
          <T
            style={{ color: theme.ink, fontFamily: font.heading, fontSize: 23 }}
          >
            {circleName}
          </T>
          <T style={{ color: theme.ink, lineHeight: 22 }}>
            Your people. Your moments. A world that feels like all of you.
          </T>
          <View style={{ alignItems: "flex-start", gap: 8 }}>
            <Button
              icon={Check}
              disabled={!!busy || !ready || applied || outdated}
              onPress={onSave}
            >
              {busy === "save"
                ? "Saving theme…"
                : applied
                  ? "Applied to Circle"
                  : "Apply to Circle"}
            </Button>
            {outdated && (
              <T style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
                Generate your updated prompt to preview the new wallpaper.
              </T>
            )}
            {(wallpaper.loading ||
              (!ready && !wallpaper.error && !imageError)) && (
              <T style={{ color: colors.muted, fontSize: 11 }}>
                Loading your wallpaper…
              </T>
            )}
            {!!wallpaper.error && (
              <T style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
                {wallpaper.error}
              </T>
            )}
            {imageError && !wallpaper.error && (
              <T style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
                Your wallpaper couldn’t be loaded. It will retry shortly.
              </T>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}
