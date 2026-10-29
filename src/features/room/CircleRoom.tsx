import React, { useState } from "react";
import { Linking, View } from "react-native";
import { Video, X } from "lucide-react-native";
import { useCircle } from "../../state/CircleProvider";
import { Banner, Button, Card, IconButton, T } from "../../ui/primitives";
import { colors, font } from "../../ui/theme";
import type { CircleRoomProps } from "./types";

/** Native builds do not load the browser WebRTC SDK. */
export function CircleRoom({ circleId, circleName, onClose }: CircleRoomProps) {
  const { state } = useCircle();
  const [error, setError] = useState("");
  const name =
    circleName ||
    state.circles.find((c) => c.id === circleId)?.name ||
    "Your Circle";
  const webUrl = process.env.EXPO_PUBLIC_WEB_APP_URL;
  const open = async () => {
    try {
      if (!webUrl || !/^https:\/\//i.test(webUrl))
        throw new Error("A secure web app address has not been configured.");
      await Linking.openURL(
        `${webUrl.replace(/\/$/, "")}/circle/${encodeURIComponent(circleId)}?tab=room`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not open the browser.",
      );
    }
  };
  return (
    <Card style={{ padding: 25, gap: 17 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Video size={25} color={colors.teal} />
        {onClose && (
          <IconButton icon={X} label="Close room" onPress={onClose} />
        )}
      </View>
      <T style={{ fontFamily: font.heading, fontSize: 23 }}>{name} room</T>
      <T style={{ color: colors.muted, lineHeight: 23 }}>
        Live voice and video currently work in Circle’s web app. Open the same
        Circle in your browser and sign in to join. Native calling requires a
        custom Expo development build and is not available in Expo Go.
      </T>
      {!!error && <Banner text={error} />}
      {webUrl && (
        <Button icon={Video} onPress={open}>
          Open Circle on the web
        </Button>
      )}
    </Card>
  );
}
export default CircleRoom;
