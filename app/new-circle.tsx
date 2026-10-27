import React, { useState } from "react";
import {
  View,
  Pressable,
  Switch,
  Image,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { ArrowLeft, Plus, Lock, ImagePlus, Users } from "lucide-react-native";
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
  const [avatar, setAvatar] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function pick(which: "cover" | "avatar") {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Please allow photo access to choose a Circle image.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: which === "cover" ? [3, 1] : [1, 1],
        quality: 0.85,
        exif: false,
      });
      if (!result.canceled)
        (which === "cover" ? setCover : setAvatar)(result.assets[0].uri);
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
        avatar,
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose Circle cover image"
          onPress={() => pick("cover")}
          style={{
            height: 190,
            backgroundColor: "#E4EEE5",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {cover ? (
            <Image
              source={{ uri: cover }}
              style={{ width: "100%", height: "100%", position: "absolute" }}
            />
          ) : (
            <>
              <ImagePlus size={30} color={c.teal} />
              <T style={{ fontFamily: font.bold, color: c.teal }}>
                Add a cover photo
              </T>
              <T style={{ fontSize: 12, color: c.muted }}>
                Set the mood for your Circle
              </T>
            </>
          )}
          <View
            style={{
              position: "absolute",
              right: 16,
              bottom: 15,
              backgroundColor: "white",
              borderRadius: 10,
              padding: 9,
            }}
          >
            <ImagePlus size={17} color={c.teal} />
          </View>
        </Pressable>
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
              accessibilityLabel="Choose Circle avatar"
              onPress={() => pick("avatar")}
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                backgroundColor: c.mint,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {avatar ? (
                <Image
                  source={{ uri: avatar }}
                  style={{ width: 64, height: 64 }}
                />
              ) : (
                <Users size={28} color={c.teal} />
              )}
            </Pressable>
            <View style={{ gap: 4 }}>
              <T style={{ fontFamily: font.bold }}>Give your Circle a face</T>
              <T style={{ color: c.muted, fontSize: 12 }}>
                Tap to add an avatar · optional
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
