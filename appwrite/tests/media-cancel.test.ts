import test from "node:test";
import assert from "node:assert/strict";
import main, { type Context, type Dependencies } from "../function/index";
import { FakeDatabase } from "./fake-database";
import type { Result } from "../../src/types";

process.env.APPWRITE_FUNCTION_API_ENDPOINT = "https://appwrite.example.test/v1";
process.env.APPWRITE_FUNCTION_PROJECT_ID = "test-project";
process.env.CIRCLE_DATABASE_ID = "circle";

test("only the uploader can cancel unfinished media; cancellation frees its reservation and leaves sealed files intact", async () => {
  const db = new FakeDatabase(),
    deleted: string[] = [];
  let who = "alice";
  const deps: Dependencies = {
    db: db.api,
    verifyIdentity: async () => ({
      $id: who,
      name: who,
      email: `${who}@example.test`,
    }),
    media: {
      storage: {
        deleteFile: async ({ fileId }: { fileId: string }) => {
          deleted.push(fileId);
        },
      },
    } as unknown as Dependencies["media"],
  };
  const call = async (body: unknown) => {
    const context: Context = {
      req: {
        bodyJson: body,
        headers: {
          "x-appwrite-user-jwt": "test-jwt",
          "x-appwrite-key": "test-key",
        },
      },
      res: { json: (data, status = 200) => ({ data, status }) },
      error: () => {},
    };
    return (await main(context, deps)) as {
      status: number;
      data: { data?: Result; error?: string };
    };
  };
  const reservation = await call({ kind: "beginUpload", mediaType: "video" });
  assert.equal(reservation.status, 200);
  const fileId = reservation.data.data!.id!;
  who = "eve";
  const denied = await call({ kind: "cancelUpload", fileId });
  assert.equal(denied.status, 400);
  assert.deepEqual(deleted, []);
  who = "alice";
  db.conflictNext = true;
  const conflicted = await call({ kind: "cancelUpload", fileId });
  assert.equal(conflicted.status, 409);
  assert.deepEqual(deleted, []);
  const canceled = await call({ kind: "cancelUpload", fileId });
  assert.equal(canceled.status, 200);
  assert.deepEqual(deleted, [fileId]);
  const tombstone = [...db.rows.values()].find(
    (value) => value.entity_id === fileId,
  )!;
  assert.equal(JSON.parse(tombstone.data).canceled, true);
  assert.equal(tombstone.related_id, "canceled");
  const another = await call({ kind: "beginUpload", mediaType: "image" });
  const sealedId = another.data.data!.id!;
  const saved = [...db.rows.values()].find(
    (row) => row.entity_id === sealedId,
  )!;
  saved.data = JSON.stringify({ ...JSON.parse(saved.data), ready: true });
  saved.related_id = "ready";
  assert.equal(
    (await call({ kind: "cancelUpload", fileId: sealedId })).status,
    400,
  );
  assert.deepEqual(deleted, [fileId]);
  // More than ten sequential cancellations must not hit the unfinished-upload cap.
  for (let count = 0; count < 12; count++) {
    const start = await call({ kind: "beginUpload", mediaType: "video" });
    assert.equal(start.status, 200);
    const id = start.data.data!.id!;
    assert.equal(
      (await call({ kind: "cancelUpload", fileId: id })).status,
      200,
    );
  }
});
