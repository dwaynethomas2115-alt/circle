/** Actual Edge handler policy tests. External Auth/LiveKit transports are stubbed;
 * hosted WebRTC, media permissions and provider webhook delivery are separate.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
const handlerSource = stripTypeScriptTypes(
  await readFile(
    new URL("../functions/circle-room/handler.ts", import.meta.url),
    "utf8",
  ),
);
const { createRoomHandler } = await import(
  `data:text/javascript,${encodeURIComponent(handlerSource)}`
);

const circle = "00000000-0000-0000-0000-000000000011";
const user = "00000000-0000-0000-0000-000000000001";
const removed = "00000000-0000-0000-0000-000000000002";
const eventId = "00000000-0000-0000-0000-000000000021";
const environment = {
  supabaseUrl: "https://supabase.test",
  serviceKey: "test-server-only-key",
  livekitUrl: "wss://circle.test.livekit.cloud",
  apiKey: "test-api-key",
  apiSecret: "test-api-secret",
  hookSecret: "test-hook-secret-long-random-value",
  revocationEnabled: "true",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const request = (
  body = {},
  headers = { Authorization: "Bearer verified-user-token" },
  query = "",
) =>
  new Request(`https://supabase.test/functions/v1/circle-room${query}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
function fixture(overrides = {}) {
  const tokens = [],
    removals = [],
    acknowledgments = [];
  let events = overrides.events || [];
  const services = {
    fetch: async (url, options) => {
      if (url.endsWith("/auth/v1/user")) return json({ id: user });
      if (url.includes("circle_members"))
        return json(url.includes(removed) ? [] : [{ user_id: user }]);
      if (url.includes("pending_circle_call_revocations")) return json(events);
      if (url.includes("ack_circle_call_revocation")) {
        acknowledgments.push(JSON.parse(options.body).p_id);
        events = [];
        return json(null);
      }
      if (url.includes("profiles")) return json([{ name: "Alex Morgan" }]);
      assert.fail(url);
    },
    issueToken: async (input) => {
      tokens.push(input);
      return "short-lived-scoped-token";
    },
    participants: async () => [],
    removeParticipant: async (room, identity) => {
      removals.push({ room, identity });
    },
    verifyWebhook: async () => ({
      event: "participant_joined",
      room: { name: `circle:${circle}` },
      participant: { identity: removed },
    }),
    ...overrides,
  };
  return {
    handle: createRoomHandler(environment, services),
    tokens,
    removals,
    acknowledgments,
    services,
  };
}

test("room broker is disabled until revocation delivery is explicitly configured", async () => {
  const f = fixture();
  const handle = createRoomHandler(
    { ...environment, revocationEnabled: undefined },
    f.services,
  );
  assert.equal(
    (await handle(request({ action: "join", circle_id: circle }))).status,
    503,
  );
  assert.equal(f.tokens.length, 0);
});
test("room broker requires verified authentication and a valid Circle UUID", async () => {
  const f = fixture();
  assert.equal(
    (await f.handle(request({ action: "join", circle_id: circle }, {}))).status,
    401,
  );
  assert.equal(
    (await f.handle(request({ action: "join", circle_id: "arbitrary-room" })))
      .status,
    400,
  );
  assert.equal(f.tokens.length, 0);
});
test("unverified Auth response cannot mint room tokens", async () => {
  const f = fixture({ fetch: async () => json({ error: "bad session" }, 401) });
  assert.equal(
    (await f.handle(request({ action: "join", circle_id: circle }))).status,
    401,
  );
  assert.equal(f.tokens.length, 0);
});
test("approved member gets one-minute grant for exactly their Circle and verified identity", async () => {
  const f = fixture();
  const response = await f.handle(
    request({
      action: "join",
      circle_id: circle,
      user_id: removed,
      room: "public",
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(f.tokens, [
    {
      identity: user,
      name: "Alex Morgan",
      room: `circle:${circle}`,
      ttlSeconds: 60,
    },
  ]);
  assert.equal((await response.json()).url, environment.livekitUrl);
});
test("non-member cannot join and their existing room participant is evicted", async () => {
  const f = fixture();
  const fetcher = f.services.fetch;
  f.services.fetch = async (url, options) =>
    url.includes("circle_members") ? json([]) : fetcher(url, options);
  const response = await f.handle(
    request({ action: "join", circle_id: circle }),
  );
  assert.equal(response.status, 403);
  assert.equal(f.tokens.length, 0);
  assert.deepEqual(f.removals, [{ room: `circle:${circle}`, identity: user }]);
});
test("membership is checked again after the room administration calls", async () => {
  const f = fixture();
  let reads = 0;
  const fetcher = f.services.fetch;
  f.services.fetch = async (url, options) =>
    url.includes("circle_members")
      ? json(++reads === 1 ? [{ user_id: user }] : [])
      : fetcher(url, options);
  assert.equal(
    (await f.handle(request({ action: "join", circle_id: circle }))).status,
    403,
  );
  assert.equal(f.tokens.length, 0);
});
test("regular callers cannot impersonate the durable revocation worker", async () => {
  const f = fixture();
  assert.equal(
    (await f.handle(request({ action: "drain", user_id: removed }))).status,
    401,
  );
  assert.equal(f.removals.length, 0);
});
test("server hook drains only persisted outbox events and acknowledges after eviction", async () => {
  const f = fixture({
    events: [{ id: eventId, circle_id: circle, user_id: removed }],
  });
  const response = await f.handle(
    request(
      { action: "drain", user_id: user },
      { "x-circle-room-secret": environment.hookSecret },
    ),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(f.removals, [
    { room: `circle:${circle}`, identity: removed },
  ]);
  assert.deepEqual(f.acknowledgments, [eventId]);
});
test("failed room eviction remains unacknowledged for retry and blocks new grants", async () => {
  const f = fixture({
    events: [{ id: eventId, circle_id: circle, user_id: removed }],
    removeParticipant: async () => {
      throw new Error("provider outage containing secret");
    },
  });
  const response = await f.handle(
    request({ action: "join", circle_id: circle }),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(f.acknowledgments, []);
  assert.equal(f.tokens.length, 0);
  assert.doesNotMatch(await response.text(), /secret|provider outage/);
});
test("sweeping a room evicts revoked participants, retaining current approved members", async () => {
  const f = fixture({
    participants: async () => [{ identity: user }, { identity: removed }],
  });
  assert.equal(
    (await f.handle(request({ action: "status", circle_id: circle }))).status,
    200,
  );
  assert.deepEqual(f.removals, [
    { room: `circle:${circle}`, identity: removed },
  ]);
  assert.equal(f.tokens.length, 0);
});
test("signed participant-joined webhook catches removal between token issuance and join", async () => {
  const f = fixture();
  const response = await f.handle(
    request(
      {},
      { Authorization: "valid-livekit-signature" },
      "?action=livekit-webhook",
    ),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(f.removals, [
    { room: `circle:${circle}`, identity: removed },
  ]);
});
test("unverified provider webhook cannot remove participants", async () => {
  const f = fixture({
    verifyWebhook: async () => {
      throw new Error("bad signature");
    },
  });
  assert.equal(
    (await f.handle(request({}, {}, "?action=livekit-webhook"))).status,
    401,
  );
  assert.equal(f.removals.length, 0);
});
test("unexpected room identifiers in provider events are rejected", async () => {
  const f = fixture({
    verifyWebhook: async () => ({
      event: "participant_joined",
      room: { name: "public-room" },
      participant: { identity: removed },
    }),
  });
  assert.equal(
    (await f.handle(request({}, {}, "?action=livekit-webhook"))).status,
    400,
  );
  assert.equal(f.removals.length, 0);
});
test("already absent participants can be acknowledged idempotently", async () => {
  const f = fixture({
    events: [{ id: eventId, circle_id: circle, user_id: removed }],
    removeParticipant: async () => {
      throw { code: "not_found" };
    },
  });
  assert.equal(
    (
      await f.handle(
        request(
          { action: "drain" },
          { "x-circle-room-secret": environment.hookSecret },
        ),
      )
    ).status,
    200,
  );
  assert.deepEqual(f.acknowledgments, [eventId]);
});

test("UUID capitalization cannot create a second room for the same Circle", async () => {
  const f = fixture();
  const canonical = "abcdefab-0000-0000-0000-000000000011";
  const response = await f.handle(
    request({ action: "join", circle_id: canonical.toUpperCase() }),
  );
  assert.equal(response.status, 200);
  assert.equal(f.tokens[0].room, `circle:${canonical}`);
});
