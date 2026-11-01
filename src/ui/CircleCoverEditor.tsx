import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Camera, Check, ImagePlus, X } from "lucide-react-native";
import { useCircle } from "../state/CircleProvider";
import { useCircleTheme, themeTint } from "../features/theme-context";
import { Banner, Button, T } from "./primitives";
import { colors, font } from "./theme";

interface DraftCover {
  scope: string;
  uri: string;
  selection: number;
}
interface CoverOperation {
  scope: string;
  id: number;
}

/** Pick locally, preview, then save through the existing private media action. */
export function CircleCoverEditor({
  visible,
  onClose,
  circleId,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  circleId: string;
  onSaved?: () => void;
}) {
  const { state, user, actions } = useCircle();
  const theme = useCircleTheme();
  const { width } = useWindowDimensions();
  const circle = state.circles.find((item) => item.id === circleId);
  const member = state.members.find(
    (item) => item.circleId === circleId && item.userId === user?.id,
  );
  const canEdit = Boolean(
    user && circle && member && ["owner", "admin"].includes(member.role),
  );
  const scope = `${visible}:${user?.id || ""}:${circleId}:${member?.role || ""}:${canEdit}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const sequence = useRef(0);
  const operation = useRef<CoverOperation | null>(null);
  const [draft, setDraft] = useState<DraftCover | null>(null);
  const [busy, setBusy] = useState<"pick" | "save" | null>(null);
  const [error, setError] = useState("");
  const [loadedUri, setLoadedUri] = useState<string>();
  const selected = canEdit && draft?.scope === scope ? draft : null;
  const previewUri = selected?.uri || circle?.cover;
  const previewKey = selected
    ? `selection_${selected.selection}`
    : `cover_${previewUri || ""}`;
  const previewRef = useRef(previewKey);
  previewRef.current = previewKey;

  useEffect(() => {
    operation.current = null;
    setDraft(null);
    setBusy(null);
    setError("");
    setLoadedUri(undefined);
    return () => {
      operation.current = null;
    };
  }, [scope]);

  function begin(kind: "pick" | "save") {
    if (!visible || !canEdit || operation.current?.scope === scope) return null;
    const pending = { scope, id: ++sequence.current };
    operation.current = pending;
    setBusy(kind);
    setError("");
    return pending;
  }
  function current(pending: CoverOperation) {
    return (
      activeScope.current === pending.scope &&
      operation.current?.id === pending.id
    );
  }
  function finish(pending: CoverOperation) {
    if (!current(pending)) return;
    operation.current = null;
    setBusy(null);
  }
  function close() {
    // A submitted save cannot be cancelled through the existing update action.
    if (operation.current?.scope === scope) return;
    onClose();
  }
  async function choosePhoto() {
    const pending = begin("pick");
    if (!pending) return;
    try {
      // Web's file chooser needs the user's direct gesture, not a permission await.
      if (Platform.OS !== "web") {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!current(pending)) return;
        if (!permission.granted) {
          setError(
            "Please allow photo access to choose your Circle cover photo.",
          );
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [3, 1],
        quality: 0.85,
        exif: false,
      });
      if (!current(pending) || result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri || asset.type === "video") {
        setError("Choose a photo for your Circle header.");
        return;
      }
      setDraft({ scope: pending.scope, uri: asset.uri, selection: pending.id });
      setLoadedUri(undefined);
    } catch {
      if (current(pending))
        setError("Your photos could not be opened. Please try again.");
    } finally {
      finish(pending);
    }
  }
  async function save() {
    if (!selected || loadedUri !== selected.uri) return;
    const pending = begin("save");
    if (!pending) return;
    try {
      // Cover-only patch leaves Circle name, description, and access settings intact.
      const result = await actions.updateCircle(circleId, {
        cover: selected.uri,
      });
      if (!current(pending)) return;
      if (!result.ok) {
        setError(
          result.error ||
            "Your cover photo could not be saved. Please try again.",
        );
        return;
      }
      onSaved?.();
      onClose();
    } catch {
      if (current(pending))
        setError(
          "We couldn’t confirm the cover change. Reopen your Circle to check before trying again.",
        );
    } finally {
      finish(pending);
    }
  }

  return (
    <Modal
      visible={visible && canEdit}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <View style={s.scrim}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          disabled={!!busy}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        />
        <View
          testID="circle-cover-editor"
          accessibilityViewIsModal
          style={[
            s.sheet,
            { backgroundColor: theme.surface, padding: width < 600 ? 20 : 28 },
          ]}
        >
          <View style={s.heading}>
            <View style={{ flex: 1, gap: 6 }}>
              <T style={{ fontFamily: font.heading, fontSize: 23 }}>
                Circle cover photo
              </T>
              <T style={s.description}>
                Choose the photo at the top of your Circle.
              </T>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close cover photo editor"
              accessibilityState={{ disabled: !!busy }}
              disabled={!!busy}
              onPress={close}
              style={({ pressed }) => [s.close, pressed && { opacity: 0.6 }]}
            >
              <X size={19} color={busy ? colors.muted : theme.ink} />
            </Pressable>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 18, paddingBottom: 2 }}
          >
            {!!error && <Banner text={error} onDismiss={() => setError("")} />}
            <View
              style={[
                s.preview,
                { backgroundColor: themeTint(theme.accent, 0.1) },
              ]}
            >
              {previewUri ? (
                <Image
                  key={previewKey}
                  testID="circle-cover-preview"
                  accessibilityLabel="Circle cover photo preview"
                  source={{ uri: previewUri }}
                  resizeMode="cover"
                  style={StyleSheet.absoluteFill}
                  onLoad={() => {
                    if (
                      activeScope.current === scope &&
                      previewRef.current === previewKey
                    )
                      setLoadedUri(previewUri);
                  }}
                  onError={() => {
                    if (
                      activeScope.current !== scope ||
                      previewRef.current !== previewKey
                    )
                      return;
                    setLoadedUri(undefined);
                    setError(
                      "This photo couldn’t be previewed. Choose another photo.",
                    );
                  }}
                />
              ) : (
                <View style={s.placeholder}>
                  <Camera size={30} color={theme.accent} />
                  <T style={{ fontFamily: font.bold, color: theme.accent }}>
                    Add your Circle’s cover photo
                  </T>
                </View>
              )}
            </View>
            <T style={s.description}>
              Wide photos work best. The header crops to fit each screen. Your
              current cover stays in place until you save.
            </T>
            <View style={{ alignItems: "flex-start" }}>
              <Button
                secondary
                icon={ImagePlus}
                disabled={!!busy}
                onPress={() => void choosePhoto()}
              >
                {busy === "pick" ? "Opening photos…" : "Choose cover photo"}
              </Button>
            </View>
            <View style={s.buttons}>
              <Button
                icon={Check}
                disabled={!!busy || !selected || loadedUri !== selected.uri}
                onPress={() => void save()}
              >
                {busy === "save" ? "Saving cover photo…" : "Save cover photo"}
              </Button>
              <Button secondary disabled={!!busy} onPress={close}>
                Cancel
              </Button>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "#153A3466",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 650,
    maxHeight: "92%",
    borderRadius: 24,
    gap: 22,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: 12 },
  close: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  preview: {
    width: "100%",
    aspectRatio: 3,
    borderRadius: 16,
    overflow: "hidden",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  description: { fontSize: 12, lineHeight: 20, color: colors.muted },
  buttons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 10,
  },
});
