import test from "node:test";
import assert from "node:assert/strict";
import { uploadFile } from "./appwriteUpload";
import { client } from "./appwrite";
import { APPWRITE_CHUNK_BYTES } from "./appwriteUploadChunks";
import type { UploadSource } from "./uploadSource";

test("the actual web Appwrite adapter uses bounded File slices, owner-only ACLs, cookie sessions, and cancelable requests", async (t) => {
  const previousFetch = globalThis.fetch,
    previousEndpoint = client.config.endpoint;
  t.after(() => {
    globalThis.fetch = previousFetch;
    client.setEndpoint(previousEndpoint);
  });
  client.setEndpoint("https://appwrite.example.test/v1");
  const size = 250 * 1024 * 1024,
    fileId = "reserved-id",
    slices: number[] = [];
  const blob = {
    size,
    slice: (_start: number, end: number) => {
      const length = end - _start;
      slices.push(length);
      return new Blob([new Uint8Array(length)]);
    },
  } as Blob;
  const source = { size, blob } as UploadSource;
  const controller = new AbortController();
  let chunks = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(
      String(url),
      "https://appwrite.example.test/v1/storage/buckets/circle-media/files",
    );
    assert.equal(init?.credentials, "include");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.signal, controller.signal);
    const body = init?.body as FormData;
    const file = body.get("file") as File;
    assert.equal(file.size, APPWRITE_CHUNK_BYTES);
    assert.deepEqual(body.getAll("permissions[]"), [
      'read("user:alice")',
      'delete("user:alice")',
    ]);
    const headers = new Headers(init?.headers);
    assert.equal(
      headers.get("content-range"),
      `bytes ${chunks * APPWRITE_CHUNK_BYTES}-${(chunks + 1) * APPWRITE_CHUNK_BYTES - 1}/${size}`,
    );
    chunks++;
    return new Response(
      JSON.stringify({
        $id: fileId,
        sizeOriginal: size,
        chunksUploaded: chunks,
        chunksTotal: 50,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };
  await uploadFile(
    fileId,
    "blob:unused",
    "video/mp4",
    "holiday.mp4",
    size,
    "alice",
    { signal: controller.signal },
    source,
  );
  assert.equal(chunks, 50);
  assert.equal(slices.length, 50);
  assert.ok(slices.every((length) => length === APPWRITE_CHUNK_BYTES));
});
