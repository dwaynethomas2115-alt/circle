import test from "node:test";
import assert from "node:assert/strict";
import {
  APPWRITE_CHUNK_BYTES,
  uploadAppwriteChunks,
  type UploadedFile,
} from "./appwriteUploadChunks";

function harness(size: number) {
  let uploaded = 0;
  const reads: number[] = [],
    sends: number[] = [],
    released: number[] = [];
  const state = (): UploadedFile => ({
    $id: "reserved-file",
    sizeOriginal: size,
    chunksUploaded: Math.ceil(uploaded / APPWRITE_CHUNK_BYTES),
    chunksTotal: Math.ceil(size / APPWRITE_CHUNK_BYTES),
  });
  const options = {
    fileId: "reserved-file",
    size,
    retryDelay: async () => {},
    read: async (offset: number, length: number) => {
      reads.push(length);
      return {
        value: offset,
        release: async () => {
          released.push(offset);
        },
      };
    },
    send: async (_value: number, offset: number, length: number) => {
      assert.equal(offset, uploaded);
      sends.push(offset);
      uploaded += length;
      return state();
    },
    inspect: async () => state(),
  };
  return { options, state, reads, sends, released };
}

test("a 250 MB Appwrite upload requests only five MiB slices and reports confirmed progress", async () => {
  const h = harness(250 * 1024 * 1024),
    progress: number[] = [];
  await uploadAppwriteChunks({
    ...h.options,
    onProgress: (p) => progress.push(p.uploaded),
  });
  assert.equal(h.reads.length, 50);
  assert.ok(h.reads.every((n) => n === APPWRITE_CHUNK_BYTES));
  assert.equal(progress.at(-1), h.options.size);
  assert.deepEqual(h.sends, h.released);
});

test("lost Appwrite responses recover committed offsets without uploading chunks twice", async () => {
  const h = harness(APPWRITE_CHUNK_BYTES * 3 + 19);
  await uploadAppwriteChunks({
    ...h.options,
    send: async (value, offset, length) => {
      await h.options.send(value, offset, length);
      throw new TypeError("Network lost after commit");
    },
  });
  assert.deepEqual(h.sends, [
    0,
    APPWRITE_CHUNK_BYTES,
    APPWRITE_CHUNK_BYTES * 2,
    APPWRITE_CHUNK_BYTES * 3,
  ]);
  assert.equal(h.state().chunksUploaded, 4);
});

test("canceling a large Appwrite upload stops new slices and releases the current native chunk", async () => {
  const h = harness(APPWRITE_CHUNK_BYTES * 5),
    controller = new AbortController();
  await assert.rejects(
    uploadAppwriteChunks({
      ...h.options,
      signal: controller.signal,
      onProgress: (p) => {
        if (p.uploaded > 0) controller.abort();
      },
    }),
    /canceled.*draft/,
  );
  assert.equal(h.sends.length, 1);
  assert.deepEqual(h.sends, h.released);
});

test("Appwrite provider limits return an actionable error and release temporary data", async () => {
  const h = harness(60 * 1024 * 1024);
  await assert.rejects(
    uploadAppwriteChunks({
      ...h.options,
      send: async () => {
        throw Object.assign(
          new Error("File exceeds the maximum size allowed by your plan"),
          { code: 413, type: "storage_file_too_large" },
        );
      },
    }),
    /Appwrite storage plan or bucket upload limit/,
  );
  assert.equal(h.reads.length, 1);
  assert.equal(h.released.length, 1);
});

test("a persistent Appwrite failure has a bounded retry budget", async () => {
  const h = harness(APPWRITE_CHUNK_BYTES * 2);
  await assert.rejects(
    uploadAppwriteChunks({
      ...h.options,
      send: async () => {
        throw Object.assign(new Error("Storage is temporarily unavailable"), {
          code: 503,
        });
      },
      inspect: async () => null,
    }),
    /unavailable/,
  );
  assert.equal(h.reads.length, 4);
  assert.equal(h.released.length, 4);
});
