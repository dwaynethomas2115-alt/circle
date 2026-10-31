/** Actual handler/repository/domain with deterministic Appwrite and image-provider doubles. */
import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import main, { type Context, type Dependencies } from "../function/index";
import { AIError, type GeneratedWallpaper } from "../function/ai";
import {
  execute,
  type Identity,
  type ThemeQuota,
  type ThemeJobResult,
} from "../function/domain";
import { Repository, type Request } from "../function/repository";
import { record, rowId } from "../function/records";
import type { WallpaperServices } from "../function/wallpaper";
import { FakeDatabase } from "./fake-database";
import { presetThemes } from "../../src/features/themes";
import type { CircleTheme } from "../../src/features/types";
import type { Result } from "../../src/types";
import {
  runCircleExecution,
  type CircleExecution,
} from "../../src/lib/appwriteExecution";
import { ThemeGenerationError } from "../../src/features/theme-errors";
process.env.APPWRITE_FUNCTION_API_ENDPOINT = "https://appwrite.example.test/v1";
process.env.APPWRITE_FUNCTION_PROJECT_ID = "test-project";
process.env.CIRCLE_DATABASE_ID = "circle";
process.env.OPENAI_API_KEY = "server-test-openai-key";
const alice: Identity = {
  $id: "alice",
  name: "Alice",
  email: "alice@example.test",
};
const bob: Identity = { $id: "bob", name: "Bob", email: "bob@example.test" };
const admin: Identity = {
  $id: "admin",
  name: "Admin",
  email: "admin@example.test",
};
const eve: Identity = { $id: "eve", name: "Eve", email: "eve@example.test" };
interface Reply<T = unknown> {
  status: number;
  body: {
    data?: T;
    error?: string;
    code?: string;
    retryAfterSeconds?: number;
    resetAt?: string;
  };
}
const wallpaperJpeg = readFileSync(
  new NodeURL("../../assets/photos/avatar-alex.jpg", import.meta.url),
);
function generated(id = "generated-wallpaper"): GeneratedWallpaper {
  return {
    theme: { ...presetThemes[1], id, source: "ai" },
    image: Buffer.from(wallpaperJpeg),
  };
}
const physicalId = (path: string) =>
  `wp_${path
    .split("/")[1]
    .replace(/\.jpg$/, "")
    .replace(/-/g, "")}`;
async function setup() {
  const db = new FakeDatabase(),
    repo = new Repository(db.api, "circle");
  const mutate = async (who: Identity, request: Request) =>
    repo.mutate(who, request, async (store) => execute(store, who, request));
  const created = await mutate(alice, {
    kind: "action",
    action: {
      type: "createCircle",
      input: {
        name: "Pink storms",
        description: "",
        category: "Friends",
        discoverable: false,
      },
    },
  });
  const circleId = (created.data as Result).id!;
  const stored = new Map<
    string,
    {
      $id: string;
      $permissions: string[];
      mimeType: string;
      sizeOriginal: number;
      chunksUploaded: number;
      chunksTotal: number;
    }
  >();
  const storageCalls: { kind: string; fileId: string; bucketId: string }[] = [];
  const storageChecks: {
    bucketId: string;
    queries?: string[];
    total?: boolean;
  }[] = [];
  const tokenCalls: { fileId: string; bucketId: string; expire: string }[] = [];
  const errorLogs: string[] = [];
  const wallpaper = {
    storage: {
      listFiles: async (args: {
        bucketId: string;
        queries?: string[];
        total?: boolean;
      }) => {
        storageChecks.push(args);
        return { files: [], total: 0 };
      },
      createFile: async (args: {
        fileId: string;
        bucketId: string;
        permissions: string[];
      }) => {
        storageCalls.push({
          kind: "create",
          fileId: args.fileId,
          bucketId: args.bucketId,
        });
        assert.deepEqual(args.permissions, []);
        assert.equal(args.bucketId, "circle-media");
        assert.match(args.fileId, /^wp_[a-f0-9]{32}$/);
        if (stored.has(args.fileId))
          throw Object.assign(new Error("File already exists"), { code: 409 });
        const file = {
          $id: args.fileId,
          $permissions: [],
          mimeType: "image/jpeg",
          sizeOriginal: wallpaperJpeg.length,
          chunksUploaded: 1,
          chunksTotal: 1,
        };
        stored.set(args.fileId, file);
        return file;
      },
      getFile: async (args: { fileId: string; bucketId: string }) => {
        storageCalls.push({
          kind: "get",
          fileId: args.fileId,
          bucketId: args.bucketId,
        });
        const file = stored.get(args.fileId);
        if (!file) throw Object.assign(new Error("missing"), { code: 404 });
        return file;
      },
      deleteFile: async (args: { fileId: string; bucketId: string }) => {
        storageCalls.push({
          kind: "delete",
          fileId: args.fileId,
          bucketId: args.bucketId,
        });
        stored.delete(args.fileId);
        return {};
      },
    },
    tokens: {
      createFileToken: async (args: {
        fileId: string;
        bucketId: string;
        expire: string;
      }) => {
        tokenCalls.push(args);
        return { secret: "private-short-lived-token" };
      },
    },
  } as unknown as WallpaperServices;
  let providerCalls = 0;
  let provider: Dependencies["generateWallpaper"] = async () =>
    generated(`generated-${providerCalls}`);
  const raw = async <T = unknown>(
    who: Identity,
    body: unknown,
  ): Promise<Reply<T>> => {
    const context: Context = {
      req: {
        bodyJson: body,
        headers: {
          "x-appwrite-user-jwt": "test-jwt",
          "x-appwrite-key": "server-test-key",
        },
      },
      res: { json: (value, status = 200) => ({ body: value, status }) },
      error: (message) => {
        errorLogs.push(message);
      },
    };
    return (await main(context, {
      db: db.api,
      verifyIdentity: async () => who,
      wallpaper,
      generateWallpaper: async (...args) => {
        providerCalls++;
        return provider!(...args);
      },
    })) as Reply<T>;
  };
  // Existing behavior checks use the same prepare/claim protocol as the client.
  const run = async <T = unknown>(
    who: Identity,
    body: unknown,
  ): Promise<Reply<T>> => {
    const input = body as {
      kind?: string;
      requestId?: string;
      circleId?: string;
      prompt?: string;
    };
    if (input.kind !== "generateTheme" || input.requestId)
      return raw<T>(who, body);
    const prepared = await raw<{ requestId: string }>(who, {
      ...input,
      kind: "prepareTheme",
      wallpaperFormat: "jpeg",
    });
    if (prepared.status !== 200) return prepared as unknown as Reply<T>;
    return raw<T>(who, { ...input, requestId: prepared.body.data!.requestId });
  };
  const join = async (who: Identity, asAdmin = false) => {
    const invitation = await mutate(alice, {
      kind: "action",
      action: { type: "createInvitation", circleId },
    });
    await mutate(who, {
      kind: "action",
      action: {
        type: "redeemInvitation",
        code: (invitation.data as Result).code!,
      },
    });
    if (asAdmin)
      await mutate(alice, {
        kind: "action",
        action: { type: "setRole", circleId, userId: who.$id, role: "admin" },
      });
  };
  const quota = () =>
    JSON.parse(
      db.rows.get(`ai_quotas/${rowId(alice.$id)}`)!.data,
    ) as ThemeQuota;
  const setQuota = (value: ThemeQuota | number[]) => {
    const entity = record("ai_quotas", alice.$id, value, "", alice.$id);
    db.seed(entity.table, entity.id, entity.data);
  };
  return {
    db,
    repo,
    mutate,
    circleId,
    stored,
    storageCalls,
    storageChecks,
    tokenCalls,
    errorLogs,
    wallpaper,
    run,
    raw,
    join,
    quota,
    setQuota,
    get providerCalls() {
      return providerCalls;
    },
    set provider(value: Dependencies["generateWallpaper"]) {
      provider = value;
    },
  };
}
const request = (circleId: string) => ({
  kind: "generateTheme",
  wallpaperFormat: "jpeg",
  circleId,
  prompt: "Pink Barbies, tornadoes and volcanoes",
});
test("older browser tabs must refresh before reserving or running JPEG wallpaper generation", async () => {
  const h = await setup();
  const legacy: Record<string, unknown> = { ...request(h.circleId) };
  delete legacy.wallpaperFormat;
  const rejected = await h.raw(alice, { ...legacy, kind: "prepareTheme" });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.body.code, "theme_client_update_required");
  assert.equal(h.db.rows.has(`ai_quotas/${rowId(alice.$id)}`), false);
  assert.equal(h.providerCalls, 0);
  assert.equal(h.storageChecks.length, 0);
  const prepared = await h.raw<{ requestId: string }>(alice, {
    ...request(h.circleId),
    kind: "prepareTheme",
  });
  const oldWorker = await h.raw(alice, {
    ...legacy,
    requestId: prepared.body.data!.requestId,
  });
  assert.equal(oldWorker.status, 409);
  assert.equal(oldWorker.body.code, "theme_client_update_required");
  assert.equal(h.quota().job?.status, "prepared");
  assert.equal(h.providerCalls, 0);
  assert.equal(h.storageChecks.length, 0);
});
test("real Appwrite flow stores a private image and permits only requesting manager preview, then current members after apply", async () => {
  const h = await setup();
  await h.join(bob);
  await h.join(admin, true);
  const response = await h.run<CircleTheme>(alice, request(h.circleId));
  assert.equal(response.status, 200);
  const theme = response.body.data!;
  assert.match(
    theme.wallpaperPath!,
    new RegExp(`^${h.circleId}/[a-f0-9-]{36}\\.jpg$`),
  );
  const fileId = physicalId(theme.wallpaperPath!);
  assert.deepEqual(h.stored.get(fileId)?.$permissions, []);
  assert.equal(h.providerCalls, 1);
  assert.equal(h.storageChecks.length, 1);
  assert.equal(h.storageChecks[0].bucketId, "circle-media");
  assert.equal(h.storageChecks[0].total, false);
  assert.deepEqual(
    h.storageChecks[0].queries?.map((query) => JSON.parse(query)),
    [{ method: "limit", values: [1] }],
  );
  assert.deepEqual(h.storageCalls, [
    { kind: "create", bucketId: "circle-media", fileId },
  ]);
  assert.equal(h.quota().successes.length, 1);
  assert.equal(h.quota().pending, undefined);
  assert.ok(
    [...h.db.rows.values()]
      .filter((row) => row.scope_id === h.circleId)
      .every((row) => row.$permissions.length === 0),
  );
  for (const who of [bob, admin, eve])
    assert.notEqual(
      (
        await h.run(who, {
          kind: "themeWallpaper",
          wallpaperPath: theme.wallpaperPath,
        })
      ).status,
      200,
    );
  assert.equal(h.tokenCalls.length, 0);
  const preview = await h.run<{ url: string; expiresAt: number }>(alice, {
    kind: "themeWallpaper",
    wallpaperPath: theme.wallpaperPath,
  });
  assert.equal(preview.status, 200);
  assert.match(
    preview.body.data!.url,
    /circle-media\/files\/wp_[a-f0-9]{32}\/view\?.*token=private-short-lived-token/,
  );
  const remaining = preview.body.data!.expiresAt - Date.now();
  assert.ok(remaining > 59000 && remaining <= 60000);
  const applied = await h.run<Result>(alice, {
    kind: "featureAction",
    action: { type: "saveTheme", circleId: h.circleId, theme },
  });
  assert.equal(applied.body.data?.ok, true);
  assert.equal(
    (
      await h.run(bob, {
        kind: "themeWallpaper",
        wallpaperPath: theme.wallpaperPath,
      })
    ).status,
    200,
  );
  await h.mutate(alice, {
    kind: "action",
    action: { type: "removeMember", circleId: h.circleId, userId: bob.$id },
  });
  const tokenCount = h.tokenCalls.length;
  assert.notEqual(
    (
      await h.run(bob, {
        kind: "themeWallpaper",
        wallpaperPath: theme.wallpaperPath,
      })
    ).status,
    200,
  );
  assert.equal(h.tokenCalls.length, tokenCount);
});
test("failed AI attempts release daily reservations while the three-per-minute retry guard remains accurate", async () => {
  const h = await setup();
  h.provider = async () => {
    throw new AIError(
      "Provider temporarily unavailable",
      502,
      "provider_unavailable",
    );
  };
  for (let i = 0; i < 3; i++) {
    const result = await h.run(alice, request(h.circleId));
    assert.equal(result.status, 502);
    assert.equal(result.body.code, "provider_unavailable");
    assert.equal(h.quota().successes.length, 0);
    assert.equal(h.quota().pending, undefined);
  }
  const denied = await h.run(alice, request(h.circleId));
  assert.equal(denied.status, 429);
  assert.equal(denied.body.code, "theme_burst_limit");
  assert.ok(
    denied.body.retryAfterSeconds! > 0 && denied.body.retryAfterSeconds! <= 60,
  );
  assert.equal(h.providerCalls, 3);
  assert.equal(h.storageCalls.length, 0);
});
test("a pending generation prevents concurrent paid calls and finishes normally", async () => {
  const h = await setup();
  let started!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.provider = async () => {
    started();
    await waiting;
    return generated();
  };
  const first = h.run(alice, request(h.circleId));
  await entered;
  const second = await h.run(alice, {
    ...request(h.circleId),
    prompt: "A different garden",
  });
  assert.equal(second.status, 429);
  assert.equal(second.body.code, "theme_in_progress");
  assert.equal(h.providerCalls, 1);
  release();
  assert.equal((await first).status, 200);
  assert.equal(h.quota().successes.length, 1);
});
test("rolling daily allowance defaults to fifty successes, reports its reset, and ignores old ten-attempt legacy daily rows", async () => {
  const h = await setup(),
    now = Date.now();
  h.setQuota({
    attempts: [],
    successes: Array.from({ length: 49 }, (_, i) => ({
      id: `success-${i}`,
      at: now - 120000 - i * 1000,
    })),
  });
  assert.equal((await h.run(alice, request(h.circleId))).status, 200);
  assert.equal(h.quota().successes.length, 50);
  const denied = await h.run(alice, request(h.circleId));
  assert.equal(denied.status, 429);
  assert.equal(denied.body.code, "theme_daily_limit");
  assert.match(denied.body.error!, /50 wallpapers.*24 hours/);
  assert.doesNotMatch(denied.body.error!, /minute/);
  assert.ok(Date.parse(denied.body.resetAt!) > now);
  assert.equal(h.providerCalls, 1);
  h.setQuota(Array.from({ length: 10 }, (_, i) => now - 120000 - i * 1000));
  assert.equal((await h.run(alice, request(h.circleId))).status, 200);
  assert.equal(h.quota().successes.length, 1);
  h.setQuota({
    attempts: [],
    successes: Array.from({ length: 50 }, (_, i) => ({
      id: `expired-${i}`,
      at: now - 25 * 3600000 - i,
    })),
  });
  assert.equal((await h.run(alice, request(h.circleId))).status, 200);
  assert.equal(h.quota().successes.length, 1);
});
test("server-configured daily allowance is enforced without the old wait-a-minute message", async () => {
  const h = await setup(),
    saved = process.env.THEME_DAILY_LIMIT;
  try {
    process.env.THEME_DAILY_LIMIT = "2";
    assert.equal((await h.run(alice, request(h.circleId))).status, 200);
    assert.equal((await h.run(alice, request(h.circleId))).status, 200);
    const denied = await h.run(alice, request(h.circleId));
    assert.equal(denied.status, 429);
    assert.equal(denied.body.code, "theme_daily_limit");
    assert.match(denied.body.error!, /2 wallpapers/);
    assert.doesNotMatch(denied.body.error!, /minute/);
    assert.equal(h.providerCalls, 2);
  } finally {
    if (saved === undefined) delete process.env.THEME_DAILY_LIMIT;
    else process.env.THEME_DAILY_LIMIT = saved;
  }
});
test("a completion transaction committed before its response was lost retains the image and confirms success without another provider call", async () => {
  const h = await setup();
  const original = h.db.updateTransaction.bind(h.db);
  let lost = false;
  h.db.updateTransaction = async (args) => {
    const proposalCommit =
      args.commit &&
      [...h.db.transactions.get(args.transactionId)!.writes.keys()].some(
        (key) => key.startsWith("ai_proposals/"),
      );
    const result = await original(args);
    if (proposalCommit && !lost) {
      lost = true;
      throw new Error("Connection lost after commit");
    }
    return result;
  };
  const result = await h.run<CircleTheme>(alice, request(h.circleId));
  assert.equal(result.status, 200);
  assert.ok(lost);
  assert.equal(h.providerCalls, 1);
  assert.equal(h.quota().successes.length, 1);
  assert.equal(h.quota().pending, undefined);
  assert.equal(h.stored.size, 1);
  assert.ok(!h.storageCalls.some((call) => call.kind === "delete"));
});
test("unknown completion status keeps a possibly committed private wallpaper and avoids a false daily-refund promise", async () => {
  const h = await setup();
  const original = h.db.updateTransaction.bind(h.db),
    get = h.db.getRow.bind(h.db);
  let lost = false;
  h.db.updateTransaction = async (args) => {
    const proposalCommit =
      args.commit &&
      [...h.db.transactions.get(args.transactionId)!.writes.keys()].some(
        (key) => key.startsWith("ai_proposals/"),
      );
    const result = await original(args);
    if (proposalCommit && !lost) {
      lost = true;
      throw new Error("Connection lost after commit");
    }
    return result;
  };
  h.db.getRow = async (args) => {
    if (lost && args.tableId === "ai_proposals")
      throw new Error("Database unavailable during confirmation");
    return get(args);
  };
  const result = await h.run(alice, request(h.circleId));
  assert.equal(result.status, 502);
  assert.equal(result.body.code, "theme_completion_unconfirmed");
  assert.match(result.body.error!, /may already count/);
  assert.equal(h.providerCalls, 1);
  assert.equal(h.stored.size, 1);
  assert.ok(!h.storageCalls.some((call) => call.kind === "delete"));
  assert.equal(h.quota().successes.length, 1);
  h.db.getRow = get;
  const recovered = await h.raw<ThemeJobResult>(alice, {
    kind: "themeResult",
    circleId: h.circleId,
    requestId: h.quota().job!.requestId,
  });
  assert.equal(recovered.body.data?.status, "completed");
  assert.equal(h.providerCalls, 1);
});

test("an uncertain uncommitted completion saves its warning without deleting the private image or releasing its hold", async () => {
  const h = await setup();
  const commit = h.db.updateTransaction.bind(h.db);
  h.db.updateTransaction = async (args) => {
    const proposalCommit =
      args.commit &&
      [...h.db.transactions.get(args.transactionId)!.writes.keys()].some(
        (key) => key.startsWith("ai_proposals/"),
      );
    if (proposalCommit)
      throw new Error("Could not confirm wallpaper completion commit");
    return commit(args);
  };
  const response = await h.run(alice, request(h.circleId));
  assert.equal(response.body.code, "theme_completion_unconfirmed");
  assert.equal(h.providerCalls, 1);
  assert.equal(h.stored.size, 1);
  assert.ok(!h.storageCalls.some((call) => call.kind === "delete"));
  const quota = h.quota();
  assert.equal(quota.successes.length, 0);
  assert.equal(quota.pending?.id, quota.job?.requestId);
  const status = await h.raw<ThemeJobResult>(alice, {
    kind: "themeResult",
    circleId: h.circleId,
    requestId: quota.job!.requestId,
  });
  assert.equal(status.body.data?.status, "failed");
  assert.equal(
    (status.body.data as { code: string }).code,
    "theme_completion_unconfirmed",
  );
  assert.match(
    (status.body.data as { error: string }).error,
    /may already count/,
  );
  const retry = await h.raw(alice, {
    ...request(h.circleId),
    kind: "prepareTheme",
    wallpaperFormat: "jpeg",
  });
  assert.equal(retry.body.code, "theme_in_progress");
  assert.equal(h.providerCalls, 1);
});

test("definite storage failure and revoked manager access clean the uncommitted wallpaper and release its daily hold", async () => {
  const storage = await setup();
  storage.wallpaper.storage.createFile = async () => {
    throw new Error("Storage quota exceeded");
  };
  const failed = await storage.run(alice, request(storage.circleId));
  assert.equal(failed.status, 507);
  assert.equal(failed.body.code, "storage_limit");
  assert.equal(storage.quota().pending, undefined);
  assert.equal(storage.quota().successes.length, 0);

  const revoked = await setup();
  revoked.provider = async () => {
    const key = `members/${rowId(`${revoked.circleId}:${alice.$id}`)}`;
    const row = revoked.db.rows.get(key)!;
    const membership = { ...JSON.parse(row.data), role: "member" };
    revoked.db.seed("members", row.$id, {
      ...row,
      data: JSON.stringify(membership),
    });
    return generated();
  };
  const denied = await revoked.run(alice, request(revoked.circleId));
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "theme_permission_changed");
  assert.equal(revoked.stored.size, 0);
  assert.ok(revoked.storageCalls.some((call) => call.kind === "delete"));
  assert.equal(revoked.quota().pending, undefined);
  assert.equal(revoked.quota().successes.length, 0);
});
test("wallpaper signing refuses a changed public ACL and never returns a token for it", async () => {
  const h = await setup();
  const generated = await h.run<CircleTheme>(alice, request(h.circleId));
  const theme = generated.body.data!;
  const fileId = physicalId(theme.wallpaperPath!);
  h.stored.get(fileId)!.$permissions = ['read("any")'];
  const response = await h.run(alice, {
    kind: "themeWallpaper",
    wallpaperPath: theme.wallpaperPath,
  });
  assert.equal(response.status, 503);
  assert.equal(response.body.code, "wallpaper_unavailable");
  assert.equal(h.tokenCalls.length, 0);
});

test("preparing is free, resumes a lost identical reservation, and rejects legacy or mismatched workers before AI", async () => {
  const h = await setup();
  const input = {
    ...request(h.circleId),
    kind: "prepareTheme",
    wallpaperFormat: "jpeg",
  };
  const first = await h.raw<{ requestId: string }>(alice, input);
  assert.equal(first.status, 200);
  const requestId = first.body.data!.requestId;
  assert.match(requestId, /^[a-f0-9-]{36}$/);
  assert.deepEqual((await h.raw(alice, input)).body.data, { requestId });
  assert.equal(h.quota().attempts.length, 1);
  assert.equal(h.providerCalls, 0);
  assert.equal(
    (await h.raw(alice, request(h.circleId))).body.code,
    "theme_client_update_required",
  );
  const mismatched = await h.raw(alice, {
    ...request(h.circleId),
    requestId,
    prompt: "Different prompt",
  });
  assert.equal(mismatched.body.code, "theme_request_unavailable");
  assert.equal(h.providerCalls, 0);
  const pending = await h.raw<ThemeJobResult>(alice, {
    kind: "themeResult",
    circleId: h.circleId,
    requestId,
  });
  assert.deepEqual(pending.body.data, { status: "pending" });
});

test("a prepared job can be claimed only once and its result stays private to the current requesting manager", async () => {
  const h = await setup();
  await h.join(bob);
  await h.join(admin, true);
  const prepared = await h.raw<{ requestId: string }>(alice, {
    ...request(h.circleId),
    kind: "prepareTheme",
    wallpaperFormat: "jpeg",
  });
  const requestId = prepared.body.data!.requestId;
  const worker = { ...request(h.circleId), requestId };
  let started!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.provider = async () => {
    started();
    await waiting;
    return generated();
  };
  const first = h.raw(alice, worker);
  await entered;
  assert.equal((await h.raw(alice, worker)).status, 200);
  assert.equal(h.providerCalls, 1);
  const status = { kind: "themeResult", circleId: h.circleId, requestId };
  assert.deepEqual((await h.raw(alice, status)).body.data, {
    status: "pending",
  });
  for (const who of [bob, admin, eve]) {
    const denied = await h.raw(who, status);
    assert.notEqual(denied.status, 200);
    assert.equal(denied.body.data, undefined);
  }
  release();
  assert.equal((await first).status, 200);
  const result = await h.raw<ThemeJobResult>(alice, status);
  assert.equal(result.body.data?.status, "completed");
  assert.equal((await h.raw(alice, worker)).status, 200);
  assert.equal(h.providerCalls, 1);
  assert.equal(h.quota().successes.length, 1);
  const memberKey = `members/${rowId(`${h.circleId}:${alice.$id}`)}`;
  const membership = h.db.rows.get(memberKey)!;
  h.db.seed("members", membership.$id, {
    ...membership,
    data: JSON.stringify({ ...JSON.parse(membership.data), role: "member" }),
  });
  assert.notEqual((await h.raw(alice, status)).status, 200);
});

test("saved failures preserve safe provider retry metadata and superseded results cannot dispatch again", async () => {
  const h = await setup();
  h.provider = async () => {
    throw new AIError("Provider is busy", 429, "provider_rate_limit", 37);
  };
  const prepared = await h.raw<{ requestId: string }>(alice, {
    ...request(h.circleId),
    kind: "prepareTheme",
    wallpaperFormat: "jpeg",
  });
  const requestId = prepared.body.data!.requestId;
  const worker = { ...request(h.circleId), requestId };
  assert.equal((await h.raw(alice, worker)).status, 429);
  const result = await h.raw<ThemeJobResult>(alice, {
    kind: "themeResult",
    circleId: h.circleId,
    requestId,
  });
  assert.deepEqual(result.body.data, {
    status: "failed",
    error: "Provider is busy",
    code: "provider_rate_limit",
    responseStatus: 429,
    retryAfterSeconds: 37,
  });
  assert.equal(h.quota().pending, undefined);
  assert.equal(h.quota().successes.length, 0);
  assert.equal((await h.raw(alice, worker)).status, 200);
  assert.equal(h.providerCalls, 1);
  await h.raw(alice, {
    ...request(h.circleId),
    kind: "prepareTheme",
    wallpaperFormat: "jpeg",
    prompt: "New scenery",
  });
  assert.equal(
    (
      await h.raw(alice, {
        kind: "themeResult",
        circleId: h.circleId,
        requestId,
      })
    ).body.code,
    "theme_request_unavailable",
  );
  assert.equal(
    (await h.raw(alice, worker)).body.code,
    "theme_request_unavailable",
  );
  assert.equal(h.providerCalls, 1);
});

test("missing provider configuration and malformed requests fail during free preflight", async () => {
  const h = await setup();
  const saved = process.env.OPENAI_API_KEY;
  try {
    delete process.env.OPENAI_API_KEY;
    const response = await h.raw(alice, {
      ...request(h.circleId),
      kind: "prepareTheme",
      wallpaperFormat: "jpeg",
    });
    assert.equal(response.status, 503);
    assert.equal(response.body.code, "provider_configuration");
    assert.equal(h.providerCalls, 0);
    assert.equal(h.db.rows.has(`ai_quotas/${rowId(alice.$id)}`), false);
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
  const invalid = await h.raw(alice, {
    ...request(h.circleId),
    kind: "prepareTheme",
    wallpaperFormat: "jpeg",
    prompt: "x",
  });
  assert.equal(invalid.status, 400);
  assert.equal(h.providerCalls, 0);
});

test("actual client retrieves handler results and failures when every async execution body is empty", async () => {
  for (const fail of [false, true]) {
    const h = await setup();
    if (fail)
      h.provider = async () => {
        throw new AIError(
          "Provider billing needs attention",
          503,
          "provider_billing",
        );
      };
    let dispatches = 0;
    let execution: CircleExecution = {
      $id: "async-worker",
      status: "waiting",
      responseBody: "",
      responseStatusCode: 0,
    };
    let worker: Promise<void> | undefined;
    const calls: string[] = [];
    const service = {
      createExecution: async (input: { body: string; async: boolean }) => {
        const body = JSON.parse(input.body);
        calls.push(body.kind);
        if (input.async) {
          dispatches++;
          worker = h.raw(alice, body).then((result) => {
            execution = {
              ...execution,
              status: "completed",
              responseStatusCode: result.status,
              responseBody: "",
            };
          });
          return execution;
        }
        const response = await h.raw(alice, body);
        return {
          $id: `sync-${calls.length}`,
          status: "completed",
          responseStatusCode: response.status,
          responseBody: JSON.stringify(response.body),
        };
      },
      getExecution: async () => execution,
    };
    const promise = runCircleExecution<CircleTheme>(service, {
      functionId: "circle-api",
      body: request(h.circleId),
      themeJobKey: `actual-handler-empty-body-${fail}`,
      pause: async () => {
        await worker;
      },
    });
    if (fail)
      await assert.rejects(
        promise,
        (cause: unknown) =>
          cause instanceof ThemeGenerationError &&
          cause.code === "provider_billing" &&
          /billing/.test(cause.message),
      );
    else {
      const theme = await promise;
      assert.ok(theme.wallpaperPath?.startsWith(`${h.circleId}/`));
    }
    assert.equal(execution.status, "completed");
    assert.equal(execution.responseBody, "");
    assert.equal(h.providerCalls, 1);
    assert.equal(dispatches, 1);
    assert.equal(calls[0], "prepareTheme");
    assert.ok(calls.includes("themeResult"));
  }
});

test("expired prepared jobs cannot execute paid work and uncertain claim commits never start it twice", async () => {
  const expired = await setup();
  const prepared = await expired.raw<{ requestId: string }>(alice, {
    ...request(expired.circleId),
    kind: "prepareTheme",
    wallpaperFormat: "jpeg",
  });
  const requestId = prepared.body.data!.requestId;
  const quota = expired.quota();
  quota.pending!.startedAt = Date.now() - 600_001;
  expired.setQuota(quota);
  const result = await expired.raw<ThemeJobResult>(alice, {
    kind: "themeResult",
    circleId: expired.circleId,
    requestId,
  });
  assert.equal(result.body.data?.status, "failed");
  assert.equal(
    (result.body.data as { code: string }).code,
    "theme_request_expired",
  );
  assert.equal(
    (await expired.raw(alice, { ...request(expired.circleId), requestId })).body
      .code,
    "theme_request_unavailable",
  );
  assert.equal(expired.providerCalls, 0);

  const uncertain = await setup();
  const pending = await uncertain.raw<{ requestId: string }>(alice, {
    ...request(uncertain.circleId),
    kind: "prepareTheme",
    wallpaperFormat: "jpeg",
  });
  const worker = {
    ...request(uncertain.circleId),
    requestId: pending.body.data!.requestId,
  };
  const commit = uncertain.db.updateTransaction.bind(uncertain.db);
  let lose = true;
  uncertain.db.updateTransaction = async (args) => {
    const claim =
      args.commit &&
      [
        ...uncertain.db.transactions.get(args.transactionId)!.writes.values(),
      ].some(
        (value) =>
          value?.actor_id === alice.$id &&
          JSON.parse(value.data).job?.status === "processing",
      );
    const result = await commit(args);
    if (claim && lose) {
      lose = false;
      throw new Error("Lost confirmation of claim commit");
    }
    return result;
  };
  assert.notEqual((await uncertain.raw(alice, worker)).status, 200);
  assert.equal(uncertain.quota().job?.status, "processing");
  assert.equal((await uncertain.raw(alice, worker)).status, 200);
  assert.equal(uncertain.providerCalls, 0);
});

test("a missing wallpaper bucket stops generation before OpenAI, releases its hold, and saves a readable failure", async () => {
  const h = await setup();
  const prepared = await h.raw<{ requestId: string }>(alice, {
    ...request(h.circleId),
    kind: "prepareTheme",
    wallpaperFormat: "jpeg",
  });
  assert.equal(prepared.status, 200);
  assert.equal(
    h.storageChecks.length,
    0,
    "prepare does not probe before a guarded worker claim",
  );
  const requestId = prepared.body.data!.requestId;
  h.wallpaper.storage.listFiles = async () => {
    throw Object.assign(new Error("Private SDK response must not be shared"), {
      code: 404,
      type: "storage_bucket_not_found",
    });
  };
  const failed = await h.raw(alice, { ...request(h.circleId), requestId });
  assert.equal(failed.status, 503);
  assert.equal(failed.body.code, "wallpaper_storage_missing");
  assert.match(failed.body.error!, /Circle media bucket is missing/);
  assert.ok(!failed.body.error!.includes("Private SDK response"));
  assert.equal(h.providerCalls, 0);
  assert.equal(h.storageCalls.length, 0);
  assert.equal(h.stored.size, 0);
  assert.equal(h.tokenCalls.length, 0);
  assert.equal(h.quota().pending, undefined);
  assert.equal(h.quota().successes.length, 0);
  const saved = await h.raw<ThemeJobResult>(alice, {
    kind: "themeResult",
    circleId: h.circleId,
    requestId,
  });
  assert.deepEqual(saved.body.data, {
    status: "failed",
    error: failed.body.error,
    code: "wallpaper_storage_missing",
    responseStatus: 503,
  });
  assert.ok(
    !h.errorLogs.some((entry) => entry.includes("wallpaper_provider_error")),
  );
});

test("unavailable or denied wallpaper storage fails closed without falsely diagnosing a missing bucket", async () => {
  for (const reason of [
    { code: 403, type: "general_unauthorized_scope" },
    { code: 404, type: "general_route_not_found" },
    { code: 503, type: "general_server_error" },
    {},
  ]) {
    const h = await setup();
    h.wallpaper.storage.listFiles = async () => {
      throw Object.assign(new Error("DO_NOT_LEAK_STORAGE_DETAILS"), reason);
    };
    const failed = await h.run(alice, request(h.circleId));
    assert.equal(failed.status, 503);
    assert.equal(failed.body.code, "wallpaper_storage_unavailable");
    assert.ok(!failed.body.error!.includes("DO_NOT_LEAK_STORAGE_DETAILS"));
    assert.ok(!failed.body.error!.includes("bucket is missing"));
    assert.equal(h.providerCalls, 0);
    assert.equal(h.storageCalls.length, 0);
    assert.equal(h.quota().pending, undefined);
    assert.equal(h.quota().successes.length, 0);
  }
});

test("storage availability is checked only for an authorized manager's successfully claimed generation", async () => {
  const h = await setup();
  let probes = 0;
  h.wallpaper.storage.listFiles = async () => {
    probes++;
    return { files: [], total: 0 };
  };
  assert.notEqual((await h.run(eve, request(h.circleId))).status, 200);
  const invalidClaim = await h.raw(alice, {
    ...request(h.circleId),
    requestId: "00000000-0000-4000-8000-000000000000",
  });
  assert.notEqual(invalidClaim.status, 200);
  await h.raw(alice, { kind: "snapshot" });
  assert.equal(probes, 0);
  assert.equal(h.providerCalls, 0);
  const generated = await h.run(alice, request(h.circleId));
  assert.equal(generated.status, 200);
  assert.equal(probes, 1);
  assert.equal(h.providerCalls, 1);
});

test("OpenAI failures log only safe diagnostic fields and do not expose diagnostics in the saved client response", async () => {
  const h = await setup();
  const safeMessage =
    "The OpenAI image request is not permitted for this project.";
  h.provider = async () => {
    throw new AIError(safeMessage, 503, "provider_access", undefined, {
      stage: "image",
      httpStatus: 403,
      requestId: "req_fixture123",
      providerCode: "permission_denied",
    });
  };
  const failed = await h.run(alice, request(h.circleId));
  assert.deepEqual(failed.body, {
    error: safeMessage,
    code: "provider_access",
  });
  const diagnostics = h.errorLogs.map((entry) => JSON.parse(entry));
  assert.deepEqual(diagnostics, [
    {
      event: "wallpaper_provider_error",
      code: "provider_access",
      stage: "image",
      httpStatus: 403,
      requestId: "req_fixture123",
      providerCode: "permission_denied",
    },
  ]);
  assert.ok(!h.errorLogs.join("\n").includes("server-test-openai-key"));
  assert.ok(!h.errorLogs.join("\n").includes(request(h.circleId).prompt));
  const result = await h.raw<ThemeJobResult>(alice, {
    kind: "themeResult",
    circleId: h.circleId,
    requestId: h.quota().job!.requestId,
  });
  assert.deepEqual(result.body.data, {
    status: "failed",
    error: safeMessage,
    code: "provider_access",
    responseStatus: 503,
  });
});

test("malformed storage availability responses fail closed before any OpenAI work", async () => {
  for (const value of [
    undefined,
    null,
    {},
    { files: null },
    { files: "invalid" },
  ]) {
    const h = await setup();
    h.wallpaper.storage.listFiles = async () =>
      value as unknown as Awaited<
        ReturnType<WallpaperServices["storage"]["listFiles"]>
      >;
    const failed = await h.run(alice, request(h.circleId));
    assert.equal(failed.status, 503);
    assert.equal(failed.body.code, "wallpaper_storage_unavailable");
    assert.equal(h.providerCalls, 0);
    assert.equal(h.storageCalls.length, 0);
    assert.equal(h.stored.size, 0);
    assert.equal(h.quota().pending, undefined);
    assert.equal(h.quota().successes.length, 0);
  }
});

test("shared-bucket wallpapers preserve ordinary account media and cannot be reused as uploaded attachments", async () => {
  const h = await setup();
  const ordinaryId = "11111111-1111-4111-8111-111111111111";
  const ordinary = {
    $id: ordinaryId,
    $permissions: [],
    mimeType: "image/jpeg",
    sizeOriginal: 512,
    chunksUploaded: 1,
    chunksTotal: 1,
  };
  h.stored.set(ordinaryId, structuredClone(ordinary));
  const upload = record(
    "uploads",
    ordinaryId,
    {
      owner: alice.$id,
      mediaType: "image",
      ready: true,
      createdAt: Date.now(),
    },
    "",
    alice.$id,
    "ready",
  );
  h.db.seed(upload.table, upload.id, upload.data);
  const post = await h.raw<Result>(alice, {
    kind: "action",
    action: {
      type: "createPost",
      input: {
        circleId: h.circleId,
        content: "An existing account photo",
        media: `awfile:${ordinaryId}`,
        mediaType: "image",
      },
    },
  });
  assert.equal(post.body.data?.ok, true);
  const response = await h.run<CircleTheme>(alice, request(h.circleId));
  assert.equal(response.status, 200);
  const wallpaperId = physicalId(response.body.data!.wallpaperPath!);
  assert.notEqual(wallpaperId, ordinaryId);
  assert.match(wallpaperId, /^wp_[a-f0-9]{32}$/);
  assert.equal(wallpaperId.length, 35);
  assert.deepEqual(h.stored.get(ordinaryId), ordinary);
  const originalPost = [...h.db.rows.values()].find(
    (row) => row.entity_id === post.body.data!.id,
  )!;
  assert.equal(JSON.parse(originalPost.data).media, `awfile:${ordinaryId}`);
  for (const action of [
    {
      type: "createPost",
      input: {
        circleId: h.circleId,
        content: "Forged wallpaper attachment",
        media: `awfile:${wallpaperId}`,
        mediaType: "image",
      },
    },
  ]) {
    const rejected = await h.raw(alice, { kind: "action", action });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.data, undefined);
  }
  for (const kind of ["cancelUpload", "finishUpload"]) {
    assert.equal(
      (await h.raw(alice, { kind, fileId: wallpaperId })).status,
      400,
    );
  }
  assert.ok(!h.storageCalls.some((call) => call.kind === "delete"));
  assert.deepEqual(h.stored.get(ordinaryId), ordinary);
  const tokenCount = h.tokenCalls.length;
  assert.notEqual(
    (
      await h.raw(alice, {
        kind: "themeWallpaper",
        wallpaperPath: `${h.circleId}/${ordinaryId}.jpg`,
      })
    ).status,
    200,
  );
  assert.equal(h.tokenCalls.length, tokenCount);
});

test("a conflicting wallpaper file is never overwritten or deleted after an unsuccessful create", async () => {
  const h = await setup();
  const prepared = await h.raw<{ requestId: string }>(alice, {
    ...request(h.circleId),
    kind: "prepareTheme",
    wallpaperFormat: "jpeg",
  });
  const requestId = prepared.body.data!.requestId;
  const fileId = `wp_${requestId.replace(/-/g, "")}`;
  const preexisting = {
    $id: fileId,
    $permissions: ['read("user:bob")', 'delete("user:bob")'],
    mimeType: "image/jpeg",
    sizeOriginal: 123,
    chunksUploaded: 1,
    chunksTotal: 1,
  };
  h.stored.set(fileId, structuredClone(preexisting));
  const failed = await h.raw(alice, { ...request(h.circleId), requestId });
  assert.equal(failed.status, 507);
  assert.equal(failed.body.code, "storage_limit");
  assert.equal(h.providerCalls, 1);
  assert.deepEqual(h.stored.get(fileId), preexisting);
  assert.ok(!h.storageCalls.some((call) => call.kind === "delete"));
  assert.equal(h.quota().successes.length, 0);
  assert.equal(h.quota().pending, undefined);
});

test("an unconfirmed create response keeps the private artifact without deleting any existing media", async () => {
  const h = await setup();
  const create = h.wallpaper.storage.createFile;
  h.wallpaper.storage.createFile = async (args) => {
    if (typeof args === "string")
      throw new Error("Expected object SDK parameters");
    await create(args);
    throw new Error(
      "The create response was lost after storage accepted the file",
    );
  };
  const failed = await h.run(alice, request(h.circleId));
  assert.equal(failed.status, 507);
  assert.equal(failed.body.code, "storage_limit");
  assert.equal(h.providerCalls, 1);
  assert.equal(h.stored.size, 1);
  assert.ok(
    [...h.stored.values()].every((file) => file.$permissions.length === 0),
  );
  assert.ok(!h.storageCalls.some((call) => call.kind === "delete"));
  assert.equal(h.quota().successes.length, 0);
});

test("legacy WebP wallpapers still use their original private bucket and membership rules", async () => {
  const h = await setup();
  await h.join(bob);
  const legacyId = "22222222-2222-4222-8222-222222222222";
  const theme: CircleTheme = {
    ...presetThemes[1],
    id: "legacy-wallpaper",
    source: "ai",
    wallpaperPath: `${h.circleId}/${legacyId}.webp`,
  };
  const saved = record("themes", h.circleId, theme, h.circleId);
  h.db.seed(saved.table, saved.id, saved.data);
  h.stored.set(legacyId, {
    $id: legacyId,
    $permissions: [],
    mimeType: "image/webp",
    sizeOriginal: 24,
    chunksUploaded: 1,
    chunksTotal: 1,
  });
  const response = await h.raw<{ url: string; expiresAt: number }>(bob, {
    kind: "themeWallpaper",
    wallpaperPath: theme.wallpaperPath,
  });
  assert.equal(response.status, 200);
  assert.match(
    response.body.data!.url,
    /\/storage\/buckets\/circle-wallpapers\/files\/22222222-2222-4222-8222-222222222222\/view\?/,
  );
  assert.deepEqual(h.storageCalls, [
    { kind: "get", bucketId: "circle-wallpapers", fileId: legacyId },
  ]);
  assert.equal(h.tokenCalls[0].bucketId, "circle-wallpapers");
  assert.equal(h.tokenCalls[0].fileId, legacyId);
  assert.equal(h.providerCalls, 0);
  const tokens = h.tokenCalls.length;
  assert.notEqual(
    (
      await h.raw(eve, {
        kind: "themeWallpaper",
        wallpaperPath: theme.wallpaperPath,
      })
    ).status,
    200,
  );
  await h.mutate(alice, {
    kind: "action",
    action: { type: "removeMember", circleId: h.circleId, userId: bob.$id },
  });
  assert.notEqual(
    (
      await h.raw(bob, {
        kind: "themeWallpaper",
        wallpaperPath: theme.wallpaperPath,
      })
    ).status,
    200,
  );
  assert.equal(h.tokenCalls.length, tokens);
});

test("a new wallpaper path never falls back to an ordinary UUID file or the legacy bucket", async () => {
  const h = await setup();
  const generated = await h.run<CircleTheme>(alice, request(h.circleId));
  const theme = generated.body.data!;
  const requestId = theme.wallpaperPath!.split("/")[1].replace(/\.jpg$/, "");
  const fileId = physicalId(theme.wallpaperPath!);
  h.stored.delete(fileId);
  h.stored.set(requestId, {
    $id: requestId,
    $permissions: [],
    mimeType: "image/jpeg",
    sizeOriginal: wallpaperJpeg.length,
    chunksUploaded: 1,
    chunksTotal: 1,
  });
  const calls = h.storageCalls.length;
  const failed = await h.raw(alice, {
    kind: "themeWallpaper",
    wallpaperPath: theme.wallpaperPath,
  });
  assert.notEqual(failed.status, 200);
  assert.equal(h.tokenCalls.length, 0);
  assert.deepEqual(h.storageCalls.slice(calls), [
    { kind: "get", bucketId: "circle-media", fileId },
  ]);
  assert.ok(h.stored.has(requestId));
});

test("a create response naming an unrelated account file cannot authorize deleting that file", async () => {
  const h = await setup();
  const fileId = "33333333-3333-4333-8333-333333333333";
  const ordinary = {
    $id: fileId,
    $permissions: [],
    mimeType: "image/jpeg",
    sizeOriginal: wallpaperJpeg.length,
    chunksUploaded: 1,
    chunksTotal: 1,
  };
  h.stored.set(fileId, structuredClone(ordinary));
  h.wallpaper.storage.createFile = async () =>
    ordinary as unknown as Awaited<
      ReturnType<WallpaperServices["storage"]["createFile"]>
    >;
  const failed = await h.run(alice, request(h.circleId));
  assert.equal(failed.status, 507);
  assert.equal(failed.body.code, "storage_limit");
  assert.deepEqual(h.stored.get(fileId), ordinary);
  assert.equal(h.stored.size, 1);
  assert.ok(!h.storageCalls.some((call) => call.kind === "delete"));
  assert.equal(h.quota().successes.length, 0);
});

test("invalid metadata after a confirmed create removes only that new wallpaper artifact", async () => {
  const h = await setup();
  const ordinaryId = "44444444-4444-4444-8444-444444444444";
  const ordinary = {
    $id: ordinaryId,
    $permissions: [],
    mimeType: "image/jpeg",
    sizeOriginal: 999,
    chunksUploaded: 1,
    chunksTotal: 1,
  };
  h.stored.set(ordinaryId, structuredClone(ordinary));
  const create = h.wallpaper.storage.createFile;
  h.wallpaper.storage.createFile = async (args) => {
    if (typeof args === "string")
      throw new Error("Expected object SDK parameters");
    const created = await create(args);
    return { ...created, $permissions: ['read("any")'] };
  };
  const failed = await h.run(alice, request(h.circleId));
  assert.equal(failed.status, 507);
  assert.equal(h.stored.size, 1);
  assert.deepEqual(h.stored.get(ordinaryId), ordinary);
  const created = h.storageCalls.find((call) => call.kind === "create")!;
  assert.match(created.fileId, /^wp_[a-f0-9]{32}$/);
  assert.deepEqual(
    h.storageCalls.filter((call) => call.kind === "delete"),
    [{ kind: "delete", bucketId: "circle-media", fileId: created.fileId }],
  );
  assert.equal(h.quota().successes.length, 0);
});

test("signing refuses returned metadata for a different file before issuing a token", async () => {
  const h = await setup();
  const generated = await h.run<CircleTheme>(alice, request(h.circleId));
  assert.equal(generated.status, 200);
  const theme = generated.body.data!;
  const get = h.wallpaper.storage.getFile;
  h.wallpaper.storage.getFile = async (args) => {
    if (typeof args === "string")
      throw new Error("Expected object SDK parameters");
    return {
      ...(await get(args)),
      $id: "55555555-5555-4555-8555-555555555555",
    };
  };
  const failed = await h.raw(alice, {
    kind: "themeWallpaper",
    wallpaperPath: theme.wallpaperPath,
  });
  assert.equal(failed.status, 503);
  assert.equal(failed.body.code, "wallpaper_unavailable");
  assert.equal(h.tokenCalls.length, 0);
  assert.ok(!h.storageCalls.some((call) => call.kind === "delete"));
});

test("wallpapers require positive integer completed-chunk metadata before storage completion or signing", async () => {
  for (const count of [0, undefined, 1.5]) {
    const stored = await setup();
    const create = stored.wallpaper.storage.createFile;
    stored.wallpaper.storage.createFile = async (args) => {
      if (typeof args === "string")
        throw new Error("Expected object SDK parameters");
      const file = await create(args);
      return {
        ...file,
        chunksTotal: count,
        chunksUploaded: count,
      } as unknown as typeof file;
    };
    const rejectedCreate = await stored.run(alice, request(stored.circleId));
    assert.equal(rejectedCreate.status, 507);
    assert.equal(stored.stored.size, 0);
    const created = stored.storageCalls.find((call) => call.kind === "create")!;
    assert.deepEqual(
      stored.storageCalls.filter((call) => call.kind === "delete"),
      [{ kind: "delete", bucketId: "circle-media", fileId: created.fileId }],
    );
    assert.equal(stored.quota().successes.length, 0);

    const signed = await setup();
    const generated = await signed.run<CircleTheme>(
      alice,
      request(signed.circleId),
    );
    assert.equal(generated.status, 200);
    const get = signed.wallpaper.storage.getFile;
    signed.wallpaper.storage.getFile = async (args) => {
      if (typeof args === "string")
        throw new Error("Expected object SDK parameters");
      const file = await get(args);
      return {
        ...file,
        chunksTotal: count,
        chunksUploaded: count,
      } as unknown as typeof file;
    };
    const rejectedRead = await signed.raw(alice, {
      kind: "themeWallpaper",
      wallpaperPath: generated.body.data!.wallpaperPath,
    });
    assert.equal(rejectedRead.status, 503);
    assert.equal(rejectedRead.body.code, "wallpaper_unavailable");
    assert.equal(signed.tokenCalls.length, 0);
    assert.equal(signed.stored.size, 1);
    assert.ok(!signed.storageCalls.some((call) => call.kind === "delete"));
  }
});
