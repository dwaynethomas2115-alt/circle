/** Pure request handler: real upstream authorization, injectable transport/LiveKit
 * adapters for tests. Secrets and administrative room operations remain server-side.
 */
export interface RoomEnvironment {
  supabaseUrl?: string;
  serviceKey?: string;
  livekitUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  hookSecret?: string;
  revocationEnabled?: string;
}
export interface LiveKitEvent {
  event?: string;
  room?: { name?: string };
  participant?: { identity?: string };
}
export interface RoomServices {
  fetch: typeof fetch;
  issueToken(input: {
    identity: string;
    name: string;
    room: string;
    ttlSeconds: number;
  }): Promise<string>;
  participants(room: string): Promise<{ identity: string }[]>;
  removeParticipant(room: string, identity: string): Promise<void>;
  verifyWebhook(body: string, authorization: string): Promise<LiveKitEvent>;
}
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const reply = (status: number, data: object) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const missingParticipant = (error: unknown) => {
  const value = error as { code?: string; status?: number };
  return value?.code === "not_found" || value?.status === 404;
};
async function sameSecret(left: string, right: string) {
  const bytes = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", bytes.encode(left)),
    crypto.subtle.digest("SHA-256", bytes.encode(right)),
  ]);
  const aa = new Uint8Array(a),
    bb = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < aa.length; index++)
    difference |= aa[index] ^ bb[index];
  return difference === 0;
}
export function createRoomHandler(
  environment: RoomEnvironment,
  services: RoomServices,
) {
  const adminHeaders = {
    apikey: environment.serviceKey || "",
    Authorization: `Bearer ${environment.serviceKey || ""}`,
    "Content-Type": "application/json",
  };
  async function admin(path: string, body?: object) {
    const response = await services.fetch(
      `${environment.supabaseUrl}/rest/v1/${path}`,
      {
        method: body ? "POST" : "GET",
        headers: adminHeaders,
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    if (!response.ok) throw new Error("Membership service unavailable.");
    return response.json();
  }
  async function member(circleId: string, userId: string) {
    const rows = await admin(
      `circle_members?select=user_id&circle_id=eq.${circleId}&user_id=eq.${userId}&limit=1`,
    );
    if (!Array.isArray(rows)) throw new Error("Invalid membership response.");
    return rows.some((row) => row.user_id === userId);
  }
  async function remove(roomName: string, identity: string) {
    try {
      await services.removeParticipant(roomName, identity);
    } catch (cause) {
      if (!missingParticipant(cause)) throw cause;
    }
  }
  async function drain() {
    const events = await admin("rpc/pending_circle_call_revocations", {});
    if (!Array.isArray(events)) throw new Error("Invalid revocation queue.");
    // Only process persisted events. A webhook body cannot supply arbitrary users.
    for (let offset = 0; offset < events.length; offset += 5) {
      await Promise.all(
        events
          .slice(offset, offset + 5)
          .map(
            async (event: {
              id: string;
              circle_id: string;
              user_id: string;
            }) => {
              if (
                !uuid(event.id) ||
                !uuid(event.circle_id) ||
                !uuid(event.user_id)
              )
                throw new Error("Invalid revocation event.");
              await remove(`circle:${event.circle_id}`, event.user_id);
              await admin("rpc/ack_circle_call_revocation", { p_id: event.id });
            },
          ),
      );
    }
    if (events.length >= 100)
      throw new Error(
        "Room access is paused while membership changes are processed.",
      );
    return events.length;
  }
  async function sweep(circleId: string) {
    let participants: { identity: string }[];
    try {
      participants = await services.participants(`circle:${circleId}`);
    } catch (cause) {
      if (missingParticipant(cause)) return;
      throw cause;
    }
    await Promise.all(
      participants.map(async (participant) => {
        if (
          !uuid(participant.identity) ||
          !(await member(circleId, participant.identity))
        )
          await remove(`circle:${circleId}`, participant.identity);
      }),
    );
  }
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS")
      return new Response("ok", { headers: cors });
    if (request.method !== "POST") return reply(405, { error: "Use POST." });
    if (
      !environment.supabaseUrl ||
      !environment.serviceKey ||
      !environment.livekitUrl ||
      !environment.apiKey ||
      !environment.apiSecret ||
      !environment.hookSecret ||
      environment.revocationEnabled !== "true"
    )
      return reply(503, {
        error:
          "Live Circle rooms are not configured. An administrator must connect the room service and membership revocation delivery.",
      });
    if (!/^wss:\/\//.test(environment.livekitUrl))
      return reply(503, {
        error: "The room service needs a secure WebSocket URL.",
      });
    if (Number(request.headers.get("content-length") || 0) > 65536)
      return reply(413, { error: "Request is too large." });
    try {
      const text = await request.text();
      if (text.length > 65536)
        return reply(413, { error: "Request is too large." });
      if (
        new URL(request.url).searchParams.get("action") === "livekit-webhook"
      ) {
        let event: LiveKitEvent;
        try {
          event = await services.verifyWebhook(
            text,
            request.headers.get("Authorization") || "",
          );
        } catch {
          return reply(401, { error: "Invalid room service signature." });
        }
        if (event.event === "participant_joined") {
          const circleId = event.room?.name?.replace(/^circle:/, "");
          const id = event.participant?.identity;
          if (
            !uuid(circleId) ||
            !uuid(id) ||
            event.room?.name !== `circle:${circleId}`
          )
            return reply(400, { error: "Invalid Circle room event." });
          // Closes the race between issuance, membership removal and WebRTC join.
          if (!(await member(circleId, id)))
            await remove(`circle:${circleId}`, id);
        }
        return reply(200, { accepted: true });
      }
      let input: { action?: string; circle_id?: string };
      try {
        input = JSON.parse(text);
      } catch {
        return reply(400, { error: "Send a JSON request." });
      }
      if (!input || typeof input !== "object" || Array.isArray(input))
        return reply(400, { error: "Invalid room request." });
      if (input.action === "drain") {
        const secret = request.headers.get("x-circle-room-secret");
        if (!secret || !(await sameSecret(secret, environment.hookSecret)))
          return reply(401, { error: "Invalid delivery authorization." });
        return reply(200, { processed: await drain() });
      }
      if (
        !["join", "status"].includes(input.action || "") ||
        !uuid(input.circle_id)
      )
        return reply(400, { error: "Choose a valid Circle room." });
      // UUID spelling must not create separate LiveKit rooms for one Circle.
      input.circle_id = input.circle_id!.toLowerCase();
      const authorization = request.headers.get("Authorization");
      if (!authorization?.startsWith("Bearer "))
        return reply(401, { error: "Sign in to join your Circle room." });
      // Authentication is verified by Supabase, never decoded and trusted locally.
      const auth = await services.fetch(
        `${environment.supabaseUrl}/auth/v1/user`,
        {
          headers: {
            apikey: environment.serviceKey,
            Authorization: authorization,
          },
        },
      );
      if (!auth.ok)
        return reply(401, { error: "Your session expired. Sign in again." });
      const user = await auth.json();
      if (!uuid(user?.id)) return reply(401, { error: "Invalid account." });
      if (!(await member(input.circle_id, user.id))) {
        await remove(`circle:${input.circle_id}`, user.id);
        return reply(403, {
          error: "Only approved members can join this Circle room.",
        });
      }
      await drain();
      await sweep(input.circle_id);
      // Recheck after the administrative network calls, immediately before minting.
      if (!(await member(input.circle_id, user.id)))
        return reply(403, {
          error: "Your Circle membership changed. Room access was removed.",
        });
      if (input.action === "status") return reply(200, { authorized: true });
      const profiles = await admin(
        `profiles?select=name&id=eq.${user.id}&limit=1`,
      );
      const name = Array.isArray(profiles)
        ? String(profiles[0]?.name || "Circle member").slice(0, 80)
        : "Circle member";
      const token = await services.issueToken({
        identity: user.id,
        name,
        room: `circle:${input.circle_id}`,
        ttlSeconds: 60,
      });
      return reply(200, {
        token,
        url: environment.livekitUrl,
        expiresIn: 60,
        authorized: true,
      });
    } catch {
      // Never forward raw upstream responses, bearer tokens, or room secrets.
      return reply(503, {
        error:
          "The private room service is unavailable. Please try again shortly.",
      });
    }
  };
}
