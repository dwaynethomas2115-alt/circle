import assert from "node:assert/strict";
import test from "node:test";
import { emptyStore } from "../function/domain";
import { hydrateMedia, type MediaServices } from "../function/media";
import { requestSchema } from "../function/schema";

test("ordinary upload commands cannot claim or attach a shared-bucket wallpaper ID", () => {
  const wallpaperId = "wp_11111111111141118111111111111111";
  for (const request of [
    { kind: "finishUpload", fileId: wallpaperId },
    { kind: "cancelUpload", fileId: wallpaperId },
    {
      kind: "action",
      action: {
        type: "createPost",
        input: {
          circleId: "family",
          content: "",
          media: `awfile:${wallpaperId}`,
          mediaType: "image",
        },
      },
    },
    {
      kind: "action",
      action: {
        type: "updateProfile",
        patch: { avatar: `awfile:${wallpaperId}` },
      },
    },
  ])
    assert.equal(requestSchema.safeParse(request).success, false);
});

test("ordinary media signing refuses wallpaper IDs even with a malformed ready reservation", async () => {
  const id = "wp_11111111111141118111111111111111";
  const store = emptyStore();
  store.app.users.push({
    id: "alice",
    name: "Alice",
    username: "alice",
    avatar: `awfile:${id}`,
    bio: "",
  });
  store.uploads = {
    [id]: {
      owner: "alice",
      mediaType: "image",
      ready: true,
      createdAt: Date.now(),
    },
  };
  let tokens = 0;
  const services = {
    tokens: {
      createFileToken: async () => {
        tokens++;
        return { secret: "test-token" };
      },
    },
  } as unknown as MediaServices;
  await assert.rejects(
    hydrateMedia(
      store.app,
      services,
      store,
      "https://appwrite.example.test/v1",
      "fixture",
    ),
    /unavailable/,
  );
  assert.equal(tokens, 0);
});

test("regular account media retains its UUID-based private viewing links", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const store = emptyStore();
  store.app.users.push({
    id: "alice",
    name: "Alice",
    username: "alice",
    avatar: `awfile:${id}`,
    bio: "",
  });
  store.uploads = {
    [id]: {
      owner: "alice",
      mediaType: "image",
      ready: true,
      createdAt: Date.now(),
    },
  };
  let tokens = 0;
  const services = {
    tokens: {
      createFileToken: async (input: { bucketId: string; fileId: string }) => {
        tokens++;
        assert.equal(input.bucketId, "circle-media");
        assert.equal(input.fileId, id);
        return { secret: "test-token" };
      },
    },
  } as unknown as MediaServices;
  const result = await hydrateMedia(
    store.app,
    services,
    store,
    "https://appwrite.example.test/v1",
    "fixture",
  );
  assert.equal(tokens, 1);
  assert.equal(
    new URL(result.users[0].avatar).pathname,
    `/v1/storage/buckets/circle-media/files/${id}/view`,
  );
});
