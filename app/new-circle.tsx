import React, { useState } from "react";
import {
  View,
  Pressable,
  Switch,
  Image,
  Platform,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { ArrowLeft, Plus, Lock, Camera } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { useCircle } from "../src/state/CircleProvider";
import {
  T,
  Card,
  Button,
  Field,
  Banner,
  IconButton,
} from "../src/ui/primitives";
import { colors as c, font, categories } from "../src/ui/theme";
import type { Category } from "../src/types";
export default function NewCircle() {
  const { actions } = useCircle();
  const { width } = useWindowDimensions();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("Friends");
  const [discoverable, setDiscoverable] = useState(false);
  const [approval, setApproval] = useState(true);
  const [cover, setCover] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function pick() {
    if (busy) return;
    try {
      // Keep the browser file picker attached to the direct user gesture.
      if (Platform.OS !== "web") {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError("Please allow photo access to choose a Circle photo.");
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        exif: false,
      });
      if (!result.canceled && result.assets?.[0]?.uri)
        setCover(result.assets[0].uri);
    } catch {
      setError("Your photos could not be opened. Please try again.");
    }
  }
  async function create() {
    if (!name.trim()) {
      setError("Give your Circle a name to get started.");
      return;
    }
    setBusy(true);
    try {
      const result = await actions.createCircle({
        name: name.trim(),
        description: description.trim(),
        category,
        cover,
        avatar: "",
        discoverable,
        approvalRequired: approval,
      });
      if (result.ok && result.id) router.replace(`/circle/${result.id}`);
      else setError(result.error || "Could not create Circle.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View
      style={{ maxWidth: 850, width: "100%", alignSelf: "center", gap: 24 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconButton
          icon={ArrowLeft}
          label="Back to Circles"
          onPress={() => router.push("/circles")}
        />
        <T style={{ fontSize: 12, color: c.muted }}>CIRCLES / CREATE</T>
      </View>
      <View style={{ gap: 9 }}>
        <T style={{ fontFamily: font.extra, fontSize: 32, letterSpacing: -1 }}>
          Every connection starts somewhere.
        </T>
        <T style={{ color: c.muted, lineHeight: 22 }}>
          Make a little space for the people who matter to you.
        </T>
      </View>
      {error ? <Banner text={error} onDismiss={() => setError("")} /> : null}
      <Card>
        <View style={{ padding: width < 600 ? 20 : 32 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              marginBottom: 26,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                cover ? "Change Circle photo" : "Add Circle photo"
              }
              accessibilityHint="Choose an optional photo for your Circle"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => void pick()}
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: c.mint,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                opacity: busy ? 0.5 : 1,
              }}
            >
              {cover ? (
                <Image
                  source={{ uri: cover }}
                  style={{ width: 64, height: 64 }}
                />
              ) : (
                <Camera size={25} color={c.teal} />
              )}
            </Pressable>
            <View style={{ flex: 1, gap: 4 }}>
              <T style={{ fontFamily: font.bold }}>Circle photo</T>
              <T style={{ color: c.muted, fontSize: 12 }}>
                Optional · You can change it later.
              </T>
            </View>
          </View>
          <Field
            label="Circle name"
            placeholder="Sunday people, The Morgan family…"
            value={name}
            onChangeText={setName}
            maxLength={80}
          />
          <Field
            label="A little about your Circle"
            placeholder="What brings your people together?"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={1000}
          />
          <T style={{ fontFamily: font.bold, fontSize: 12, marginBottom: 12 }}>
            Find your category
          </T>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 9,
              marginBottom: 30,
            }}
          >
            {categories.map((x) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: category === x }}
                aria-checked={category === x}
                key={x}
                onPress={() => setCategory(x)}
                style={{
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: category === x ? c.teal : c.line,
                  backgroundColor: category === x ? c.mint : "white",
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                }}
              >
                <T
                  style={{
                    fontSize: 13,
                    color: category === x ? c.teal : c.muted,
                    fontFamily: font.medium,
                  }}
                >
                  {x}
                </T>
              </Pressable>
            ))}
          </View>
          <View
            style={{
              paddingVertical: 20,
              borderTopWidth: 1,
              borderColor: c.line,
              flexDirection: "row",
              gap: 15,
              alignItems: "center",
            }}
          >
            <View style={{ flex: 1, gap: 6 }}>
              <T style={{ fontFamily: font.bold }}>
                Let people discover this Circle
              </T>
              <T style={{ color: c.muted, fontSize: 12, lineHeight: 19 }}>
                Your name and description can be found. All posts and
                conversations stay private.
              </T>
            </View>
            <Switch
              accessibilityLabel="Discoverable Circle"
              value={discoverable}
              onValueChange={setDiscoverable}
              trackColor={{ false: "#DAE3DC", true: c.teal }}
              thumbColor="white"
            />
          </View>
          <View
            style={{
              paddingVertical: 20,
              borderTopWidth: 1,
              borderColor: c.line,
              flexDirection: "row",
              gap: 15,
              alignItems: "center",
            }}
          >
            <View style={{ flex: 1, gap: 6 }}>
              <T style={{ fontFamily: font.bold }}>
                Approve membership requests
              </T>
              <T style={{ color: c.muted, fontSize: 12, lineHeight: 19 }}>
                Choose who joins your space. Invitations are managed separately.
              </T>
            </View>
            <Switch
              accessibilityLabel="Require membership approval"
              value={approval}
              onValueChange={setApproval}
              trackColor={{ false: "#DAE3DC", true: c.teal }}
              thumbColor="white"
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
              backgroundColor: c.mint,
              padding: 14,
              borderRadius: 11,
              marginVertical: 15,
            }}
          >
            <Lock size={15} color={c.teal} />
            <T style={{ fontSize: 12, color: c.teal, flex: 1, lineHeight: 19 }}>
              Private by design. Only approved members can see what you share.
            </T>
          </View>
          <Button disabled={busy || !name.trim()} icon={Plus} onPress={create}>
            {busy ? "Creating your space…" : "Create your Circle"}
          </Button>
        </View>
      </Card>
    </View>
  );
}
