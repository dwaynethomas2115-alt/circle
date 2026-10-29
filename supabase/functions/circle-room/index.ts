/* eslint-disable import/no-unresolved -- Deno resolves npm: and explicit .ts imports. */
// Deno resolves these imports when Supabase deploys the Edge Function.
// @ts-ignore Deno npm: specifier, separate from Expo dependencies.
import * as LiveKitServer from "npm:livekit-server-sdk@2.14.0";
// @ts-ignore Deno requires explicit TypeScript extensions.
import { createRoomHandler } from "./handler.ts";
const { AccessToken, RoomServiceClient, WebhookReceiver } = LiveKitServer;
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
const apiKey = Deno.env.get("LIVEKIT_API_KEY");
const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
const livekitUrl = Deno.env.get("LIVEKIT_URL");
const service = new RoomServiceClient(
  (livekitUrl || "wss://not-configured.invalid").replace(/^wss:/, "https:"),
  apiKey || "not-configured",
  apiSecret || "not-configured",
);
const receiver = new WebhookReceiver(
  apiKey || "not-configured",
  apiSecret || "not-configured",
);
Deno.serve(
  createRoomHandler(
    {
      supabaseUrl: Deno.env.get("SUPABASE_URL"),
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      livekitUrl,
      apiKey,
      apiSecret,
      hookSecret: Deno.env.get("CIRCLE_ROOM_HOOK_SECRET"),
      revocationEnabled: Deno.env.get("LIVEKIT_REVOCATION_ENABLED"),
    },
    {
      fetch,
      issueToken: async ({ identity, name, room, ttlSeconds }) => {
        const token = new AccessToken(apiKey!, apiSecret!, {
          identity,
          name,
          ttl: ttlSeconds,
        });
        token.addGrant({
          roomJoin: true,
          room,
          canPublish: true,
          canSubscribe: true,
          canPublishData: false,
          canUpdateOwnMetadata: false,
        });
        return token.toJwt();
      },
      participants: (room) => service.listParticipants(room),
      removeParticipant: (room, identity) =>
        service.removeParticipant(room, identity),
      verifyWebhook: (body, authorization) =>
        receiver.receive(body, authorization),
    },
  ),
);
