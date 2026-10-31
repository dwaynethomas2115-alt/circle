import test from "node:test";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import assert from "node:assert/strict";
import { Permission, Role } from "node-appwrite";
import { execute, emptyStore, recordTheme, project } from "../function/domain";
import {
  MAX_FILE_BYTES,
  MAX_PHOTO_BYTES,
  sealUpload,
  hydrateMedia,
  type MediaServices,
} from "../function/media";
import { generateTheme } from "../function/ai";
import { presetThemes } from "../../src/features/themes";
import type { Result } from "../../src/types";
const alice = { $id: "alice", name: "Alice", email: "alice@example.test" },
  eve = { $id: "eve", name: "Eve", email: "eve@example.test" };
function setup() {
  let store = execute(emptyStore(), alice, { kind: "snapshot" }).store;
  const created = execute(store, alice, {
    kind: "action",
    action: {
      type: "createCircle",
      input: {
        name: "Private",
        description: "",
        category: "Friends",
        discoverable: false,
      },
    },
  });
  store = created.store;
  const reserved = execute(store, alice, {
    kind: "beginUpload",
    mediaType: "image",
  });
  return {
    store: reserved.store,
    fileId: (reserved.data as Result).id!,
    circleId: (created.data as Result).id!,
  };
}
function mediaHarness(fileId: string, change: object = {}) {
  const file = {
    $id: fileId,
    $permissions: [
      Permission.read(Role.user("alice")),
      Permission.delete(Role.user("alice")),
    ],
    mimeType: "image/jpeg",
    sizeOriginal: 1200,
    chunksUploaded: 1,
    chunksTotal: 1,
    ...change,
  };
  const calls: string[] = [];
  const services = {
    storage: {
      getFile: async () => file,
      updateFile: async ({ permissions }: { permissions: string[] }) => {
        calls.push("seal");
        file.$permissions = permissions;
        return file;
      },
    },
    tokens: {
      createFileToken: async ({
        fileId: id,
        expire,
      }: {
        fileId: string;
        expire: string;
      }) => {
        assert.equal(id, fileId);
        const ttl = Date.parse(expire) - Date.now();
        assert.ok(ttl > 59000 && ttl <= 60000);
        calls.push("token");
        return { secret: "test-short-lived-token" };
      },
    },
  } as unknown as MediaServices;
  return { services, calls, file };
}
test("media sealing checks reservation owner, MIME, size, upload completion and ACLs", async () => {
  const f = setup();
  for (const change of [
    { mimeType: "text/html" },
    { sizeOriginal: 200 * 1024 * 1024 + 1 },
    { chunksUploaded: 0 },
    { $permissions: [Permission.read(Role.any())] },
  ]) {
    const h = mediaHarness(f.fileId, change);
    await assert.rejects(sealUpload(h.services, f.store, alice, f.fileId));
    assert.equal(h.calls.length, 0);
  }
  const h = mediaHarness(f.fileId);
  await assert.rejects(
    sealUpload(h.services, f.store, eve, f.fileId),
    /unavailable/,
  );
  await sealUpload(h.services, f.store, alice, f.fileId);
  assert.deepEqual(h.file.$permissions, []);
});
test("only ready owned attachments can be published; outsiders cannot receive file tokens", async () => {
  const f = setup();
  const command = {
    kind: "action",
    action: {
      type: "createPost",
      input: {
        circleId: f.circleId,
        content: "",
        media: `awfile:${f.fileId}`,
        mediaType: "image",
      },
    },
  };
  assert.throws(() => execute(f.store, alice, command), /unavailable/);
  const sealed = execute(f.store, alice, {
    kind: "finishUpload",
    fileId: f.fileId,
  });
  assert.throws(() => execute(sealed.store, eve, command), /another account/);
  const published = execute(sealed.store, alice, command);
  const own = execute(published.store, alice, { kind: "snapshot" });
  const h = mediaHarness(f.fileId);
  const visible = await hydrateMedia(
    own.data as ReturnType<typeof project>,
    h.services,
    own.store,
    "https://appwrite.example.test/v1",
    "project",
  );
  assert.match(visible.posts[0].media!, /token=test-short-lived-token/);
  assert.equal(published.store.app.posts[0].media, `awfile:${f.fileId}`);
  const outsider = execute(published.store, eve, { kind: "snapshot" });
  await hydrateMedia(
    outsider.data as ReturnType<typeof project>,
    h.services,
    outsider.store,
    "https://appwrite.example.test/v1",
    "project",
  );
  assert.deepEqual(h.calls, ["token"]);
});
test("AI quota, role checks and signed-in proposal provenance are server enforced", () => {
  const f = setup(),
    request = {
      kind: "prepareTheme",
      wallpaperFormat: "jpeg",
      circleId: f.circleId,
      prompt: "A lovely garden",
    };
  assert.throws(() => execute(f.store, eve, request), /owners and admins/);
  const reserved = execute(f.store, alice, request);
  assert.deepEqual(execute(reserved.store, alice, request).data, reserved.data);
  assert.throws(
    () =>
      execute(reserved.store, alice, {
        ...request,
        prompt: "Different scenery",
      }),
    /already being/,
  );
  const theme = {
    ...presetThemes[0],
    id: "generated-theme",
    wallpaperPath: `${f.circleId}/${(reserved.data as { requestId: string }).requestId}.jpg`,
    source: "ai" as const,
  };
  const apply = {
    kind: "featureAction",
    action: { type: "saveTheme", circleId: f.circleId, theme },
  };
  assert.throws(
    () => execute(reserved.store, alice, apply),
    /fresh authorized/,
  );
  const complete = recordTheme(reserved.store, alice, f.circleId, theme);
  assert.equal((execute(complete, alice, apply).data as Result).ok, true);
  assert.throws(
    () =>
      execute(complete, alice, {
        ...apply,
        action: { ...apply.action, theme: { ...theme, label: "Forged" } },
      }),
    /fresh authorized/,
  );
  complete.app.members = [];
  assert.throws(
    () => recordTheme(complete, alice, f.circleId, theme),
    /access changed/,
  );
});
test("AI sends only explicit prompt, validates response and rejects unsafe palettes", async () => {
  const { label, accent, background, surface, ink, motif } = presetThemes[0];
  const palette = { label, accent, background, surface, ink, motif };
  const transport: typeof fetch = async (url, options) => {
    if (String(url).endsWith("/images/generations"))
      return new Response(
        JSON.stringify({
          data: [
            {
              b64_json: readFileSync(
                new NodeURL(
                  "../../assets/photos/avatar-alex.jpg",
                  import.meta.url,
                ),
              ).toString("base64"),
            },
          ],
        }),
      );
    const body = JSON.parse(String(options?.body));
    assert.deepEqual(body.messages[1], {
      role: "user",
      content: "A lovely garden",
    });
    assert.equal(body.messages.length, 2);
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(palette) } }],
      }),
      { status: 200 },
    );
  };
  const generated = await generateTheme(
    "A lovely garden",
    "fake-key",
    transport,
  );
  assert.equal(generated.theme.source, "ai");
  const invalid: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({ ...palette, ink: "#FFFFFF" }),
            },
          },
        ],
      }),
    );
  await assert.rejects(
    generateTheme("A lovely garden", "fake-key", invalid),
    /readability/,
  );
});

test("server sealing enforces the larger per-type limits without relaxing private ACLs", async () => {
  assert.equal(MAX_PHOTO_BYTES, 200 * 1024 * 1024);
  assert.equal(MAX_FILE_BYTES, 250 * 1024 * 1024);
  const f = setup();
  for (const bytes of [50_000_001, 100 * 1024 * 1024, MAX_PHOTO_BYTES]) {
    const accepted = mediaHarness(f.fileId, { sizeOriginal: bytes });
    await sealUpload(accepted.services, f.store, alice, f.fileId);
    assert.deepEqual(accepted.calls, ["seal"]);
  }
  const rejected = mediaHarness(f.fileId, {
    sizeOriginal: MAX_PHOTO_BYTES + 1,
  });
  await assert.rejects(sealUpload(rejected.services, f.store, alice, f.fileId));
  assert.deepEqual(rejected.calls, []);
  f.store.uploads![f.fileId].mediaType = "video";
  const video = mediaHarness(f.fileId, {
    sizeOriginal: MAX_FILE_BYTES,
    mimeType: "video/mp4",
  });
  await sealUpload(video.services, f.store, alice, f.fileId);
  assert.deepEqual(video.calls, ["seal"]);
  const tooLarge = mediaHarness(f.fileId, {
    sizeOriginal: MAX_FILE_BYTES + 1,
    mimeType: "video/mp4",
  });
  await assert.rejects(sealUpload(tooLarge.services, f.store, alice, f.fileId));
});
