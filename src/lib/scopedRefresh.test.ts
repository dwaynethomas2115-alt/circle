import test from "node:test";
import assert from "node:assert/strict";
import { createScopedRefresh } from "./scopedRefresh";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function fixture() {
  let scope: string | null = "account-a:circle-member";
  const requests: ReturnType<typeof deferred<number>>[] = [];
  const accepted: { value: number; scope: string }[] = [];
  const rejected: unknown[] = [];
  let clears = 0;
  const refresh = createScopedRefresh({
    scope: () => scope,
    load: () => {
      const request = deferred<number>();
      requests.push(request);
      return request.promise;
    },
    accept: (value, scope) => accepted.push({ value, scope }),
    reject: (cause) => rejected.push(cause),
    clear: () => {
      clears++;
    },
  });
  return {
    refresh,
    requests,
    accepted,
    rejected,
    setScope: (value: string | null) => {
      scope = value;
    },
    clears: () => clears,
  };
}

test("slow feature reads survive repeated poll ticks instead of being superseded forever", async () => {
  const f = fixture();
  const first = f.refresh.refresh();
  await Promise.resolve();
  for (let tick = 0; tick < 5; tick++) assert.equal(f.refresh.refresh(), first);
  assert.equal(f.requests.length, 1);
  f.requests[0].resolve(7);
  await first;
  assert.deepEqual(f.accepted, [
    { value: 7, scope: "account-a:circle-member" },
  ]);
});

test("a post-write fresh read invalidates the earlier read and only commits fresh data", async () => {
  const f = fixture();
  const old = f.refresh.refresh();
  await Promise.resolve();
  const fresh = f.refresh.refresh(true);
  await Promise.resolve();
  assert.equal(f.requests.length, 2);
  f.requests[1].resolve(2);
  await fresh;
  f.requests[0].resolve(1);
  await old;
  assert.deepEqual(
    f.accepted.map((x) => x.value),
    [2],
  );
});

test("account and membership changes discard responses before effect cleanup", async () => {
  for (const scope of [
    "account-b:circle-member",
    "account-a:other-circle",
    null,
  ]) {
    const f = fixture();
    const pending = f.refresh.refresh();
    await Promise.resolve();
    f.setScope(scope);
    f.requests[0].resolve(1);
    await pending;
    assert.deepEqual(f.accepted, []);
    assert.deepEqual(f.rejected, []);
  }
});

test("scope changes start an independent read and late errors cannot clear its state", async () => {
  const f = fixture();
  const old = f.refresh.refresh();
  await Promise.resolve();
  f.setScope("account-a:circle-owner");
  const current = f.refresh.refresh();
  await Promise.resolve();
  f.requests[1].resolve(3);
  await current;
  f.requests[0].reject(new Error("old permission failure"));
  await old;
  assert.deepEqual(f.accepted, [{ value: 3, scope: "account-a:circle-owner" }]);
  assert.deepEqual(f.rejected, []);
});

test("unknown access clears features and unmount prevents late publication", async () => {
  const f = fixture();
  const pending = f.refresh.refresh();
  await Promise.resolve();
  f.setScope(null);
  await f.refresh.refresh();
  assert.equal(f.clears(), 1);
  f.refresh.setActive(false);
  f.requests[0].resolve(1);
  await pending;
  await f.refresh.refresh();
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.accepted, []);
});

test("a failed read reports once and permits a later successful retry", async () => {
  const f = fixture();
  const first = f.refresh.refresh();
  await Promise.resolve();
  f.requests[0].reject(new Error("temporary failure"));
  await first;
  assert.equal(f.rejected.length, 1);
  const retry = f.refresh.refresh();
  await Promise.resolve();
  f.requests[1].resolve(5);
  await retry;
  assert.deepEqual(
    f.accepted.map((x) => x.value),
    [5],
  );
});

test("invalid response processing fails closed rather than escaping as an unhandled error", async () => {
  const rejected: unknown[] = [];
  const failure = new Error("invalid response shape");
  const refresh = createScopedRefresh({
    scope: () => "account-a",
    load: async () => ({}),
    accept: () => {
      throw failure;
    },
    reject: (cause) => rejected.push(cause),
    clear: () => {},
  });
  await refresh.refresh();
  assert.deepEqual(rejected, [failure]);
});
