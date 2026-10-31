import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL as NodeURL } from "node:url";
import { uploadFile } from "./appwriteUpload";
import { client } from "./appwrite";
import { APPWRITE_CHUNK_BYTES } from "./appwriteUploadChunks";
import type { UploadSource } from "./uploadSource";

test("the actual web Appwrite adapter uses bounded File slices, owner-only ACLs, cookie sessions, and cancelable requests", async (t) => {
  const previousFetch = globalThis.fetch,
    previousEndpoint = client.config.endpoint,
    previousProject = client.config.project;
  t.after(() => {
    globalThis.fetch = previousFetch;
    client.setEndpoint(previousEndpoint);
    client.setProject(previousProject);
  });
  client.setEndpoint("https://appwrite.example.test/v1");
  client.setProject("circle-upload-regression");
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
    assert.equal(headers.get("X-Appwrite-Project"), "circle-upload-regression");
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

test("a JPEG photo sends its configured project and lets fetch set the multipart boundary", async (t) => {
  const previousFetch = globalThis.fetch,
    previousEndpoint = client.config.endpoint,
    previousProject = client.config.project;
  t.after(() => {
    globalThis.fetch = previousFetch;
    client.setEndpoint(previousEndpoint);
    client.setProject(previousProject);
  });
  client.setEndpoint("https://appwrite.example.test/v1");
  client.setProject("circle-photo-project");
  const bytes = new Uint8Array(
    await readFile(
      new NodeURL("../../assets/photos/avatar-alex.jpg", import.meta.url),
    ),
  );
  const blob = new Blob([bytes], { type: "image/jpeg" });
  assert.ok(blob.size < APPWRITE_CHUNK_BYTES);
  const fileId = "photo-reservation";
  let uploads = 0;
  globalThis.fetch = async (url, init) => {
    uploads++;
    assert.equal(
      String(url),
      "https://appwrite.example.test/v1/storage/buckets/circle-media/files",
    );
    assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "include");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("X-Appwrite-Project"), "circle-photo-project");
    assert.equal(headers.has("content-type"), false);
    const request = new Request(String(url), init);
    assert.match(
      request.headers.get("content-type") || "",
      /^multipart\/form-data; boundary=/,
    );
    const body = init?.body as FormData;
    const photo = body.get("file") as File;
    assert.equal(body.get("fileId"), fileId);
    assert.equal(photo.name, "family.jpg");
    assert.equal(photo.type, "image/jpeg");
    assert.equal(photo.size, blob.size);
    assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), bytes);
    assert.deepEqual(body.getAll("permissions[]"), [
      'read("user:alice")',
      'delete("user:alice")',
    ]);
    return new Response(
      JSON.stringify({
        $id: fileId,
        sizeOriginal: blob.size,
        chunksUploaded: 1,
        chunksTotal: 1,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };
  await uploadFile(
    fileId,
    "blob:selected-photo",
    "image/jpeg",
    "family.jpg",
    blob.size,
    "alice",
    {},
    { size: blob.size, blob } as UploadSource,
  );
  assert.equal(uploads, 1);
});

test("a lost photo upload acknowledgement recovers with a project-scoped GET and sends only the remaining chunk", async (t) => {
  const previousFetch = globalThis.fetch,
    previousEndpoint = client.config.endpoint,
    previousProject = client.config.project;
  t.after(() => {
    globalThis.fetch = previousFetch;
    client.setEndpoint(previousEndpoint);
    client.setProject(previousProject);
  });
  client.setEndpoint("https://appwrite.example.test/v1");
  client.setProject("circle-recovery-project");
  const fileId = "recoverable-photo",
    size = APPWRITE_CHUNK_BYTES + 17,
    blob = new Blob([new Uint8Array(size)], { type: "image/jpeg" });
  const calls: string[] = [],
    progress: number[] = [];
  let uploadedChunks = 0;
  const savedFile = () => ({
    $id: fileId,
    sizeOriginal: size,
    chunksUploaded: uploadedChunks,
    chunksTotal: 2,
  });
  globalThis.fetch = async (url, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("X-Appwrite-Project"), "circle-recovery-project");
    assert.equal(init?.credentials, "include");
    assert.equal(init?.redirect, "error");
    if (init?.method === "GET") {
      calls.push("GET");
      assert.equal(
        String(url),
        `https://appwrite.example.test/v1/storage/buckets/circle-media/files/${fileId}`,
      );
      assert.equal(init.body, undefined);
      assert.equal(uploadedChunks, 1);
      return new Response(JSON.stringify(savedFile()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    assert.equal(init?.method, "POST");
    assert.equal(
      String(url),
      "https://appwrite.example.test/v1/storage/buckets/circle-media/files",
    );
    const range = headers.get("content-range")!;
    calls.push(`POST ${range}`);
    const body = init?.body as FormData;
    const photo = body.get("file") as File;
    assert.equal(body.get("fileId"), fileId);
    assert.equal(photo.type, "image/jpeg");
    if (uploadedChunks === 0) {
      assert.equal(photo.size, APPWRITE_CHUNK_BYTES);
      assert.equal(headers.has("x-appwrite-id"), false);
      uploadedChunks++;
      throw new TypeError("Failed to fetch"); // Storage accepted the first chunk before its response was lost.
    }
    assert.equal(uploadedChunks, 1);
    assert.equal(headers.get("x-appwrite-id"), fileId);
    assert.equal(photo.size, 17);
    uploadedChunks++;
    return new Response(JSON.stringify(savedFile()), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };
  await uploadFile(
    fileId,
    "blob:selected-photo",
    "image/jpeg",
    "family.jpg",
    size,
    "alice",
    { onProgress: (value) => progress.push(value.uploaded) },
    { size, blob } as UploadSource,
  );
  assert.deepEqual(calls, [
    `POST bytes 0-${APPWRITE_CHUNK_BYTES - 1}/${size}`,
    "GET",
    `POST bytes ${APPWRITE_CHUNK_BYTES}-${size - 1}/${size}`,
  ]);
  assert.equal(uploadedChunks, 2);
  assert.deepEqual(progress, [0, APPWRITE_CHUNK_BYTES, size]);
});
