import test from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../data/seed";
import { emptyCircle } from "../state/empty";
import {
  createSessionRefresher,
  loadSessionSnapshot,
  readSessionAccount,
  SessionAccountMismatch,
  signInWithSession,
  type SessionAccount,
  type SessionRefreshResult,
} from "./session";

const alice = { $id: "alex", name: "Alex", email: "alex@example.test" };
const bob = { $id: "bob", name: "Bob", email: "bob@example.test" };
const failure = (code: number, type = "service_unavailable") =>
  Object.assign(new Error(type), { code, type });
function privateSnapshot() {
  const state = createSeed();
  state.currentUserId = alice.$id;
  const own = state.users.find((profile) => profile.id === alice.$id)!;
  own.avatar = "https://private.example/avatar?token=never-retain";
  return state;
}
function assertPrivateCleared(result: SessionRefreshResult) {
  const state = result.state;
  for (const key of [
    "circles",
    "members",
    "requests",
    "invitations",
    "posts",
    "comments",
    "messages",
    "notifications",
    "blocks",
    "reports",
  ] as const)
    assert.deepEqual(state[key], [], `${key} must be removed during recovery`);
  assert.ok(state.users.length <= 1);
  for (const profile of state.users) {
    assert.equal(profile.id, state.currentUserId);
    assert.equal(profile.avatar, "");
    assert.equal(profile.bio, "");
    assert.equal(profile.username, "");
  }
  assert.doesNotMatch(JSON.stringify(state), /never-retain|FAMILY2026/);
}

test("a verified matching existing session is reused without a session POST or deletion", async () => {
  let posts = 0;
  let deletions = 0;
  const service = {
    get: async () => alice,
    createEmailPasswordSession: async () => {
      posts++;
    },
    deleteSession: async () => {
      deletions++;
    },
  };
  assert.equal(
    await signInWithSession(service, "  ALEX@example.test ", "dummy-password"),
    alice,
  );
  assert.equal(posts, 0);
  assert.equal(deletions, 0);
});

test("an existing different account is not replaced or silently accepted", async () => {
  let posts = 0;
  let deletions = 0;
  const service = {
    get: async () => bob,
    createEmailPasswordSession: async () => {
      posts++;
    },
    deleteSession: async () => {
      deletions++;
    },
  };
  await assert.rejects(
    signInWithSession(service, alice.email, "dummy"),
    SessionAccountMismatch,
  );
  assert.equal(posts, 0);
  assert.equal(deletions, 0);
  await assert.rejects(
    signInWithSession(
      {
        ...service,
        get: async () => ({ ...alice, email: "alex+other@example.test" }),
      },
      alice.email,
      "dummy",
    ),
    SessionAccountMismatch,
    "do not strip email aliases",
  );
});

test("a missing session creates once, preserves password text, and verifies the returned identity", async () => {
  let gets = 0;
  const posts: unknown[] = [];
  const service = {
    get: async () => {
      if (++gets === 1) throw failure(401, "user_unauthorized");
      return alice;
    },
    createEmailPasswordSession: async (input: unknown) => {
      posts.push(input);
    },
  };
  assert.equal(
    await signInWithSession(service, ` ${alice.email} `, " dummy password "),
    alice,
  );
  assert.deepEqual(posts, [
    { email: alice.email, password: " dummy password " },
  ]);
  assert.equal(gets, 2);
});

test("already-open session races and lost POST responses recover only after a matching fresh account check", async () => {
  for (const error of [
    failure(401, "user_session_already_exists"),
    failure(409, "user_session_already_exists"),
    new TypeError("Network response was lost"),
    failure(502),
  ]) {
    for (const recovered of [alice, bob]) {
      let gets = 0;
      let posts = 0;
      const service = {
        get: async () => {
          if (++gets === 1) throw failure(401);
          return recovered;
        },
        createEmailPasswordSession: async () => {
          posts++;
          throw error;
        },
      };
      if (recovered === alice)
        assert.equal(
          await signInWithSession(service, alice.email, "dummy"),
          alice,
        );
      else
        await assert.rejects(
          signInWithSession(service, alice.email, "dummy"),
          SessionAccountMismatch,
        );
      assert.equal(
        posts,
        1,
        "a recovery check must not retry session creation",
      );
      assert.equal(gets, 2);
    }
  }
});

test("invalid credentials and definitive session errors are not converted into successful recovery", async () => {
  for (const error of [
    failure(401, "user_invalid_credentials"),
    failure(400, "general_argument_invalid"),
    failure(403, "user_blocked"),
  ]) {
    let gets = 0;
    const service = {
      get: async () => {
        gets++;
        throw failure(401);
      },
      createEmailPasswordSession: async () => {
        throw error;
      },
    };
    await assert.rejects(
      signInWithSession(service, alice.email, "wrong-password"),
      (cause) => cause === error,
    );
    assert.equal(
      gets,
      1,
      "do not hide definitive credential/access errors with another identity check",
    );
  }
});

test("an unavailable account preflight does not create or delete a session", async () => {
  for (const error of [failure(403), failure(503), new TypeError("offline")]) {
    let posts = 0;
    await assert.rejects(
      signInWithSession(
        {
          get: async () => {
            throw error;
          },
          createEmailPasswordSession: async () => {
            posts++;
          },
        },
        alice.email,
        "dummy",
      ),
      (cause) => cause === error,
    );
    assert.equal(posts, 0);
  }
});

test("a successful session response without a readable matching account is not accepted", async () => {
  for (const identity of [null, bob]) {
    let gets = 0;
    let posts = 0;
    const service = {
      get: async () => {
        if (++gets === 1 || !identity) throw failure(401);
        return identity;
      },
      createEmailPasswordSession: async () => {
        posts++;
      },
    };
    await assert.rejects(signInWithSession(service, alice.email, "dummy"));
    assert.equal(posts, 1);
  }
  let gets = 0;
  const original = new TypeError("lost response");
  await assert.rejects(
    signInWithSession(
      {
        get: async () => {
          gets++;
          throw failure(401);
        },
        createEmailPasswordSession: async () => {
          throw original;
        },
      },
      alice.email,
      "dummy",
    ),
    (cause) => cause === original,
  );
  assert.equal(gets, 2);
});

test("only an actual account 401 is treated as an absent session", async () => {
  assert.equal(
    await readSessionAccount({
      get: async () => {
        throw failure(401);
      },
    }),
    null,
  );
  for (const status of [403, 429, 500])
    await assert.rejects(
      readSessionAccount({
        get: async () => {
          throw failure(status);
        },
      }),
    );
});

test("fresh authorized snapshots are accepted only for the freshly verified account", async () => {
  const state = privateSnapshot();
  const good = await loadSessionSnapshot({
    currentAccount: async () => alice,
    snapshot: async () => state,
  });
  assert.equal(good.status, "authenticated");
  assert.equal(good.state, state);
  for (const changed of [
    { ...state, currentUserId: bob.$id },
    {
      ...state,
      users: state.users.filter((profile) => profile.id !== alice.$id),
    },
  ]) {
    const result = await loadSessionSnapshot({
      currentAccount: async () => alice,
      snapshot: async () => changed,
    });
    assert.equal(result.status, "unknown");
    assert.equal(result.state.currentUserId, null);
    assertPrivateCleared(result);
  }
});

test("absent/expired account sessions clear identity and never request private snapshots", async () => {
  for (const expired of [false, true]) {
    let snapshots = 0;
    const result = await loadSessionSnapshot({
      currentAccount: async () => {
        if (expired) throw failure(401);
        return null;
      },
      snapshot: async () => {
        snapshots++;
        return privateSnapshot();
      },
    });
    assert.equal(result.status, "signedOut");
    assert.equal(result.state.currentUserId, null);
    assert.equal(snapshots, 0);
    assertPrivateCleared(result);
  }
});

test("uncertain account checks fail closed into recovery rather than a signed-out claim", async () => {
  for (const error of [failure(403), failure(502), new TypeError("offline")]) {
    let snapshots = 0;
    const result = await loadSessionSnapshot({
      currentAccount: async () => {
        throw error;
      },
      snapshot: async () => {
        snapshots++;
        return privateSnapshot();
      },
    });
    assert.equal(result.status, "unknown");
    assert.equal(result.state.currentUserId, null);
    assert.equal(snapshots, 0);
    assertPrivateCleared(result);
  }
});

test("snapshot failures clear every private slice while retaining only fresh own identity", async () => {
  for (const error of [failure(403), failure(503), new TypeError("offline")]) {
    const result = await loadSessionSnapshot({
      currentAccount: async () => alice,
      snapshot: async () => {
        throw error;
      },
    });
    assert.equal(result.status, "unknown");
    assert.equal(result.state.currentUserId, alice.$id);
    assert.equal(result.state.users[0].email, alice.email);
    assertPrivateCleared(result);
  }
});

test("a snapshot 401 rechecks the account instead of assuming either login or logout", async () => {
  for (const latest of [
    null,
    alice,
    bob,
    failure(401),
    failure(403),
    new TypeError("offline"),
  ]) {
    let gets = 0;
    const result = await loadSessionSnapshot({
      currentAccount: async (): Promise<SessionAccount | null> => {
        if (++gets === 1) return alice;
        if (latest instanceof Error) throw latest;
        return latest;
      },
      snapshot: async () => {
        throw Object.assign(new Error("Function denied request"), {
          status: 401,
          code: "authentication",
        });
      },
    });
    assert.equal(gets, 2);
    const expired =
      latest === null ||
      (latest instanceof Error && (latest as { code?: number }).code === 401);
    assert.equal(result.status, expired ? "signedOut" : "unknown");
    assert.equal(
      result.state.currentUserId,
      latest === alice || latest === bob ? latest.$id : null,
    );
    assertPrivateCleared(result);
  }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const connected = (account = alice): SessionRefreshResult => ({
  status: "authenticated",
  state: {
    ...emptyCircle(),
    currentUserId: account.$id,
    users: [
      {
        id: account.$id,
        name: account.name,
        email: account.email,
        username: "",
        bio: "",
        avatar: "",
      },
    ],
  },
  error: null,
});

test("overlapping read refreshes share one request instead of racing each other", async () => {
  const pending = deferred<SessionRefreshResult>();
  let reads = 0;
  const results: SessionRefreshResult[] = [];
  const controller = createSessionRefresher(
    () => {
      reads++;
      return pending.promise;
    },
    (result) => results.push(result),
  );
  const first = controller.refresh();
  const second = controller.refresh();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(reads, 1);
  pending.resolve(connected());
  await first;
  assert.equal(results.length, 1);
});

test("sign-out/account-switch fences old reads and does not block the new identity refresh", async () => {
  const old = deferred<SessionRefreshResult>();
  let reads = 0;
  const results: SessionRefreshResult[] = [];
  const controller = createSessionRefresher(
    () => (++reads === 1 ? old.promise : Promise.resolve(connected(bob))),
    (result) => results.push(result),
  );
  const stale = controller.refresh();
  await Promise.resolve();
  controller.setPaused(true);
  await controller.refresh();
  assert.equal(reads, 1);
  controller.setPaused(false);
  await controller.refresh();
  assert.equal(results[0].state.currentUserId, bob.$id);
  old.resolve(connected(alice));
  await stale;
  assert.equal(results.length, 1, "the old account cannot be resurrected");
});

test("unmount and a forced post-write refresh ignore stale completions", async () => {
  const pending = deferred<SessionRefreshResult>();
  let commits = 0;
  const controller = createSessionRefresher(
    () => pending.promise,
    () => {
      commits++;
    },
  );
  const first = controller.refresh();
  await Promise.resolve();
  controller.setActive(false);
  pending.resolve(connected());
  await first;
  assert.equal(commits, 0);
  controller.setActive(true);
  await controller.refresh();
  assert.equal(commits, 1);
  controller.invalidate();
  await controller.refresh();
  assert.equal(commits, 2);
});

test("a foreground or retry boundary invalidates an old account snapshot before checking the current account", async () => {
  const old = deferred<SessionRefreshResult>();
  let reads = 0;
  const results: SessionRefreshResult[] = [];
  const controller = createSessionRefresher(
    () => (++reads === 1 ? old.promise : Promise.resolve(connected(bob))),
    (result) => results.push(result),
  );
  const stale = controller.refresh();
  await Promise.resolve();
  // This is the foreground/visibility/manual-retry boundary used by the hook.
  controller.invalidate();
  await controller.refresh();
  assert.equal(reads, 2, "a new identity check must not join the old flight");
  assert.equal(results[0].state.currentUserId, bob.$id);
  old.resolve(connected(alice));
  await stale;
  assert.equal(results.length, 1);
});
