import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Radio,
  Users,
  X,
  Volume2,
  LoaderCircle,
} from "lucide-react-native";
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteAudioTrack,
} from "livekit-client";
import { useCircle } from "../../state/CircleProvider";
import { invokeCircle } from "../../lib/appwrite";
import { Banner, Button, IconButton, T } from "../../ui/primitives";
import { font } from "../../ui/theme";
import type { CircleRoomProps } from "./types";

const safeError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Could not connect. Please try again.";
const initials = (name: string) =>
  name
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function ParticipantTile({
  participant,
  local,
  refreshKey,
}: {
  participant: Participant;
  local: boolean;
  refreshKey: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const publication = participant.getTrackPublication(Track.Source.Camera);
  const visible = publication?.track && !publication.isMuted;
  useEffect(() => {
    const element = video.current;
    if (!element || !visible || !publication?.track) return;
    publication.track.attach(element);
    return () => {
      publication.track?.detach(element);
    };
  }, [publication, visible, refreshKey]);
  const name = participant.name || "Circle member";
  return (
    <View style={s.tile}>
      <View style={s.initials}>
        <T style={{ color: "#C3E8D7", fontSize: 29, fontFamily: font.heading }}>
          {initials(name)}
        </T>
      </View>
      {visible && (
        <video
          ref={video}
          autoPlay
          muted={local}
          playsInline
          aria-label={`${name}'s camera`}
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            objectFit: "cover",
            transform: local ? "scaleX(-1)" : undefined,
          }}
        />
      )}
      <View style={s.name}>
        <T style={{ color: "white", fontSize: 12 }}>
          {name}
          {local ? " (you)" : ""}
        </T>
        {!participant.isMicrophoneEnabled && (
          <MicOff size={12} color="#D2E1DB" />
        )}
      </View>
    </View>
  );
}
function RemoteAudio({ track }: { track: RemoteAudioTrack }) {
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);
  return <audio autoPlay ref={audio} />;
}
function Control({
  label,
  icon: Icon,
  active,
  danger,
  onPress,
  disabled,
}: {
  label: string;
  icon: typeof Mic;
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.control,
        active && { backgroundColor: "#2A6554" },
        danger && { backgroundColor: "#AB4545" },
        pressed && { opacity: 0.65 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Icon size={19} color="white" />
      <T style={{ color: "white", fontSize: 11 }}>{label}</T>
    </Pressable>
  );
}

export function CircleRoom({ circleId, circleName, onClose }: CircleRoomProps) {
  const { state, user, mode } = useCircle();
  const { width } = useWindowDimensions();
  const name =
    circleName ||
    state.circles.find((c) => c.id === circleId)?.name ||
    "Your Circle";
  const approved =
    !!user &&
    state.members.some((m) => m.circleId === circleId && m.userId === user.id);
  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);
  const preview = useRef<MediaStream | null>(null);
  const previewElement = useRef<HTMLVideoElement>(null);
  const mounted = useRef(true);
  const attempt = useRef(0);
  const [status, setStatus] = useState<
    "idle" | "joining" | "connected" | "reconnecting"
  >("idle");
  const [mic, setMic] = useState(false);
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const demo = mode === "demo";

  const stopPreview = useCallback(() => {
    preview.current?.getTracks().forEach((track) => track.stop());
    preview.current = null;
    if (previewElement.current) previewElement.current.srcObject = null;
  }, []);
  const leave = useCallback(() => {
    ++attempt.current;
    const current = roomRef.current;
    roomRef.current = null;
    if (current) {
      current.removeAllListeners();
      void current.disconnect(true);
    }
    stopPreview();
    if (mounted.current) {
      setRoom(null);
      setStatus("idle");
      setMic(false);
      setCamera(false);
      setBusy(false);
      setAudioBlocked(false);
    }
  }, [stopPreview]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      leave();
    };
  }, [leave]);
  useEffect(() => {
    if (!approved) leave();
  }, [approved, leave]);
  useEffect(() => {
    if (previewElement.current)
      previewElement.current.srcObject = preview.current;
  }, [camera, mic]);

  const endpoint = useCallback(
    async (action: "join" | "status") => {
      return invokeCircle<{
        token?: string;
        url?: string;
        authorized?: boolean;
      }>({ kind: "room", circleId, action });
    },
    [circleId],
  );

  useEffect(() => {
    if (!room || demo) return;
    let active = true,
      running = false;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const result = await endpoint("status");
        if (!result.authorized)
          throw new Error(
            "Your Circle membership no longer permits this room.",
          );
      } catch (cause) {
        if (active) {
          leave();
          setError(safeError(cause));
        }
      } finally {
        running = false;
      }
    }, 10_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [room, demo, endpoint, leave]);

  const join = async () => {
    if (busy || !approved || demo) return;
    setBusy(true);
    setError("");
    setStatus("joining");
    const ticket = ++attempt.current;
    const next = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 960, height: 540, frameRate: 24 },
      },
    });
    roomRef.current = next;
    const refresh = () => {
      if (mounted.current && ticket === attempt.current) {
        setRevision((r) => r + 1);
        setMic(next.localParticipant.isMicrophoneEnabled);
        setCamera(next.localParticipant.isCameraEnabled);
        setAudioBlocked(!next.canPlaybackAudio);
      }
    };
    [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ActiveSpeakersChanged,
      RoomEvent.AudioPlaybackStatusChanged,
    ].forEach((event) => next.on(event, refresh));
    next.on(RoomEvent.Reconnecting, () => {
      if (mounted.current) setStatus("reconnecting");
    });
    next.on(RoomEvent.Reconnected, () => {
      if (mounted.current) setStatus("connected");
    });
    next.on(RoomEvent.Disconnected, () => {
      if (mounted.current && ticket === attempt.current) {
        leave();
        setError("You left the room or the connection ended.");
      }
    });
    try {
      const grant = await endpoint("join");
      if (!grant.token || !grant.url)
        throw new Error("The room service returned an incomplete connection.");
      if (!mounted.current || ticket !== attempt.current) {
        await next.disconnect();
        return;
      }
      await next.connect(grant.url, grant.token);
      if (!mounted.current || ticket !== attempt.current) {
        await next.disconnect();
        return;
      }
      setRoom(next);
      setStatus("connected");
      refresh();
      // Joining never turns on a microphone or camera without the user pressing its control.
    } catch (cause) {
      if (mounted.current && ticket === attempt.current) {
        leave();
        setError(safeError(cause));
      }
    } finally {
      if (mounted.current && ticket === attempt.current) setBusy(false);
    }
  };
  const togglePreview = async (kind: "mic" | "camera") => {
    setBusy(true);
    setError("");
    const ticket = ++attempt.current;
    const nextMic = kind === "mic" ? !mic : mic,
      nextCamera = kind === "camera" ? !camera : camera;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera and microphone preview need HTTPS and a supported browser.",
        );
      if (!nextMic && !nextCamera) {
        stopPreview();
        setMic(false);
        setCamera(false);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: nextMic,
        video: nextCamera ? { facingMode: "user" } : false,
      });
      if (!mounted.current || ticket !== attempt.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      stopPreview();
      preview.current = stream;
      setMic(nextMic);
      setCamera(nextCamera);
      if (previewElement.current) previewElement.current.srcObject = stream;
    } catch (cause) {
      if (mounted.current) setError(safeError(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const toggle = async (kind: "mic" | "camera") => {
    if (demo) return togglePreview(kind);
    if (!room || busy) return;
    const currentRoom = room;
    setBusy(true);
    setError("");
    try {
      if (kind === "mic")
        await currentRoom.localParticipant.setMicrophoneEnabled(!mic);
      else await currentRoom.localParticipant.setCameraEnabled(!camera);
      if (!mounted.current || roomRef.current !== currentRoom) {
        currentRoom.localParticipant.trackPublications.forEach((publication) =>
          publication.track?.stop(),
        );
        await currentRoom.disconnect(true);
        return;
      }
      setRevision((r) => r + 1);
      setMic(room.localParticipant.isMicrophoneEnabled);
      setCamera(room.localParticipant.isCameraEnabled);
    } catch (cause) {
      if (mounted.current) setError(safeError(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const people: Participant[] = room
    ? [room.localParticipant, ...room.remoteParticipants.values()]
    : [];
  const audioTracks = room
    ? [...room.remoteParticipants.values()].flatMap((participant) =>
        [...participant.audioTrackPublications.values()]
          .filter((publication) => !!publication.track)
          .map((publication) => publication.track as RemoteAudioTrack),
      )
    : [];
  return (
    <View style={s.shell}>
      <View style={s.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={s.live}>
            <Radio size={18} color="#A7D7C4" />
          </View>
          <View>
            <T
              style={{ color: "white", fontFamily: font.heading, fontSize: 18 }}
            >
              {name} room
            </T>
            <T style={{ color: "#AFC4BB", fontSize: 11, marginTop: 3 }}>
              {demo
                ? "Local preview · just you"
                : status === "connected"
                  ? `${people.length} ${people.length === 1 ? "person" : "people"} in the room`
                  : status === "reconnecting"
                    ? "Reconnecting…"
                    : "Drop in for a little face time"}
            </T>
          </View>
        </View>
        {onClose && (
          <IconButton
            icon={X}
            color="white"
            label="Close room"
            onPress={() => {
              leave();
              onClose();
            }}
          />
        )}
      </View>
      <View style={{ padding: width < 600 ? 15 : 22, gap: 18 }}>
        {demo && (
          <View style={s.notice}>
            <T style={{ color: "#C8E7DB", fontSize: 12, lineHeight: 19 }}>
              Local demo: camera and microphone stay on this device. This
              preview does not call other people. Live Circle rooms require the
              configured room service.
            </T>
          </View>
        )}
        {!!error && <Banner text={error} onDismiss={() => setError("")} />}
        {!approved ? (
          <T style={{ color: "white", padding: 25 }}>
            Only approved Circle members can join this room.
          </T>
        ) : (
          <>
            <View style={[s.grid, width < 600 && { flexDirection: "column" }]}>
              {demo ? (
                <View style={s.tile}>
                  <View style={s.initials}>
                    <T
                      style={{
                        color: "#C3E8D7",
                        fontSize: 30,
                        fontFamily: font.heading,
                      }}
                    >
                      {initials(user?.name || "You")}
                    </T>
                  </View>
                  <video
                    ref={previewElement}
                    muted
                    autoPlay
                    playsInline
                    aria-label="Your local camera preview"
                    style={{
                      display: camera ? "block" : "none",
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      position: "absolute",
                      transform: "scaleX(-1)",
                    }}
                  />
                  <View style={s.name}>
                    <T style={{ color: "white", fontSize: 12 }}>
                      {user?.name || "You"} · local preview
                    </T>
                    {!mic && <MicOff size={12} color="white" />}
                  </View>
                </View>
              ) : people.length ? (
                people.map((participant) => (
                  <ParticipantTile
                    key={participant.identity}
                    participant={participant}
                    local={participant === room?.localParticipant}
                    refreshKey={revision}
                  />
                ))
              ) : (
                <View style={[s.tile, { flexBasis: "100%", gap: 13 }]}>
                  <Users color="#B2D4C5" size={35} />
                  <T
                    style={{
                      color: "white",
                      fontFamily: font.heading,
                      fontSize: 20,
                    }}
                  >
                    The room is open to your Circle.
                  </T>
                  <T
                    style={{
                      color: "#ABC2B8",
                      textAlign: "center",
                      maxWidth: 330,
                      lineHeight: 21,
                    }}
                  >
                    Join to see who’s here. Start with audio, add your camera
                    whenever you feel like it.
                  </T>
                  <Button
                    icon={status === "joining" ? LoaderCircle : Radio}
                    disabled={busy}
                    onPress={join}
                  >
                    {status === "joining" ? "Joining…" : "Join Circle room"}
                  </Button>
                </View>
              )}
            </View>
            {!demo && status === "connected" && people.length === 1 && (
              <T
                style={{ textAlign: "center", color: "#AFC4BB", fontSize: 12 }}
              >
                You’re the first here. Other approved members can join this same
                room.
              </T>
            )}
            {audioTracks.map((track) => (
              <RemoteAudio key={track.sid} track={track} />
            ))}
            {audioBlocked && (
              <Button
                icon={Volume2}
                onPress={() => {
                  void room
                    ?.startAudio()
                    .then(() => setAudioBlocked(false))
                    .catch((cause) => setError(safeError(cause)));
                }}
              >
                Enable room sound
              </Button>
            )}
            {(demo || room) && (
              <View style={s.controls}>
                <Control
                  label={mic ? "Mute mic" : demo ? "Preview mic" : "Unmute mic"}
                  icon={mic ? Mic : MicOff}
                  active={mic}
                  disabled={busy}
                  onPress={() => {
                    void toggle("mic");
                  }}
                />
                <Control
                  label={
                    camera
                      ? "Turn camera off"
                      : demo
                        ? "Preview camera"
                        : "Turn camera on"
                  }
                  icon={camera ? Video : VideoOff}
                  active={camera}
                  disabled={busy}
                  onPress={() => {
                    void toggle("camera");
                  }}
                />
                <Control
                  label={demo ? "Stop preview" : "Leave room"}
                  icon={PhoneOff}
                  danger
                  onPress={leave}
                />
              </View>
            )}
            <T
              style={{
                color: "#8BA69A",
                fontSize: 10,
                textAlign: "center",
                lineHeight: 17,
              }}
            >
              {demo
                ? "No remote participants or live presence are simulated."
                : "Approved members only · Microphone and camera start off · Leave whenever you like"}
            </T>
          </>
        )}
      </View>
    </View>
  );
}
export default CircleRoom;
const s = StyleSheet.create({
  shell: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#153B30",
    marginVertical: 4,
  },
  header: {
    padding: 20,
    borderBottomColor: "#2F5145",
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  live: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#285343",
    alignItems: "center",
    justifyContent: "center",
  },
  notice: { backgroundColor: "#244D3E", borderRadius: 12, padding: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    flex: 1,
    flexBasis: "45%",
    minWidth: 180,
    minHeight: 235,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: "#244E3F",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  initials: {
    width: 85,
    height: 85,
    borderRadius: 44,
    backgroundColor: "#35624E",
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 8,
    borderRadius: 7,
    backgroundColor: "#102F27CC",
  },
  controls: { flexDirection: "row", justifyContent: "center", gap: 10 },
  control: {
    borderRadius: 12,
    minWidth: 76,
    padding: 12,
    backgroundColor: "#365A4D",
    alignItems: "center",
    gap: 7,
  },
});
