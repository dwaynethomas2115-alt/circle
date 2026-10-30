import test from "node:test";
import assert from "node:assert/strict";
import {
  resumableUpload,
  storageUploadError,
  UPLOAD_CHUNK_BYTES,
  type UploadSource,
} from "./resumableUpload";

const endpoint = "https://project.supabase.co/storage/v1/upload/resumable";
const path = "circle/user/video.mp4";
function source(size: number) {
  const reads: { start: number; length: number }[] = [];
  const value: UploadSource = {
    size,
    read: async (start, length) => {
      reads.push({ start, length });
      return new ArrayBuffer(length);
    },
  };
  return { reads, value };
}
function options(value: UploadSource) {
  return {
    endpoint,
    bucket: "circle-media",
    path,
    contentType: "video/mp4",
    source: value,
    headers: async () => ({ Authorization: "Bearer private-token" }),
    retryDelay: async () => {},
  };
}
function reply(
  status: number,
  offset?: number,
  extra: Record<string, string> = {},
) {
  return new Response(null, {
    status,
    headers: {
      ...(offset !== undefined ? { "Upload-Offset": String(offset) } : {}),
      ...extra,
    },
  });
}

test("a 250 MB upload reads only bounded slices, reports progress, and uses refreshed account headers", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const media = source(250 * 1024 * 1024);
  let offset = 0,
    authorizationRequests = 0,
    calls = 0;
  const progress: number[] = [];
  globalThis.fetch = async (url, init) => {
    calls++;
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), `Bearer token-${calls}`);
    assert.equal(headers.get("Tus-Resumable"), "1.0.0");
    if (init?.method === "POST") {
      assert.equal(headers.get("Upload-Length"), String(media.value.size));
      assert.match(
        headers.get("Upload-Metadata") || "",
        /bucketName Y2lyY2xlLW1lZGlh/,
      );
      return reply(201, 0, { Location: `${endpoint}/upload-id` });
    }
    assert.equal(String(url), `${endpoint}/upload-id`);
    assert.equal(init?.method, "PATCH");
    assert.equal(Number(headers.get("Upload-Offset")), offset);
    const length = (init.body as ArrayBuffer).byteLength;
    assert.equal(
      length,
      Math.min(UPLOAD_CHUNK_BYTES, media.value.size - offset),
    );
    offset += length;
    return reply(204, offset);
  };
  await resumableUpload({
    ...options(media.value),
    headers: async () => ({
      Authorization: `Bearer token-${++authorizationRequests}`,
    }),
    onProgress: (p) => progress.push(p.uploaded),
  });
  assert.equal(offset, media.value.size);
  assert.equal(authorizationRequests, calls);
  assert.equal(
    media.reads.length,
    Math.ceil(media.value.size / UPLOAD_CHUNK_BYTES),
  );
  assert.ok(media.reads.every((read) => read.length <= UPLOAD_CHUNK_BYTES));
  assert.equal(progress.at(-1), media.value.size);
});

test("lost chunk responses resume from the server offset without sending committed chunks twice", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const media = source(UPLOAD_CHUNK_BYTES * 2 + 123);
  let offset = 0,
    heads = 0;
  const patched: number[] = [];
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "POST")
      return reply(201, 0, { Location: "/storage/v1/upload/resumable/id" });
    if (init?.method === "HEAD") {
      heads++;
      return reply(200, offset);
    }
    const start = Number(new Headers(init?.headers).get("Upload-Offset"));
    patched.push(start);
    assert.equal(start, offset);
    offset += (init?.body as ArrayBuffer).byteLength;
    throw new TypeError("Network disconnected after server commit");
  };
  await resumableUpload(options(media.value));
  assert.equal(heads, 3);
  assert.deepEqual(patched, [0, UPLOAD_CHUNK_BYTES, UPLOAD_CHUNK_BYTES * 2]);
  assert.equal(offset, media.value.size);
});

test("upload addresses cannot redirect account credentials to another host or endpoint", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  for (const location of [
    "https://attacker.test/upload",
    "/auth/v1/admin/users",
    "https://project.supabase.co@attacker.test/upload",
  ]) {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return reply(201, 0, { Location: location });
    };
    await assert.rejects(
      resumableUpload(options(source(1024).value)),
      /unexpected address/,
    );
    assert.equal(calls, 1);
  }
});

test("provider size restrictions give an actionable error without repeatedly uploading", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(
      '{"message":"The object exceeded the maximum allowed size"}',
      { status: 413 },
    );
  };
  await assert.rejects(
    resumableUpload(options(source(60 * 1024 * 1024).value)),
    /storage provider.*limit.*storage plan/i,
  );
  assert.equal(calls, 1);
  assert.match(storageUploadError(403).message, /permission/);
});

test("cancellation stops before another chunk is read or transmitted", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const controller = new AbortController();
  const media = source(UPLOAD_CHUNK_BYTES * 3);
  let offset = 0,
    patches = 0;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "POST")
      return reply(201, 0, { Location: `${endpoint}/id` });
    offset += (init?.body as ArrayBuffer).byteLength;
    patches++;
    return reply(204, offset);
  };
  await assert.rejects(
    resumableUpload({
      ...options(media.value),
      signal: controller.signal,
      onProgress: (p) => {
        if (p.uploaded > 0) controller.abort();
      },
    }),
    /canceled.*draft/i,
  );
  assert.equal(patches, 1);
  assert.equal(media.reads.length, 1);
});
