import test from "node:test";
import assert from "node:assert/strict";
import {
  completePasswordRecovery,
  passwordRecoveryUrl,
  recoveryCredentials,
  requestPasswordRecovery,
  RECOVERY_EMAIL_MESSAGE,
} from "./passwordRecovery";

const credentials = { userId: "mock-user", secret: "mock-reset-secret" };
const password = "mock-new-password";

test("recovery email always returns to the fixed public auth route", () => {
  assert.equal(
    passwordRecoveryUrl("https://circle.example.test/join#invite=ABC"),
    "https://circle.example.test/auth?mode=reset",
  );
  assert.equal(
    new URL(passwordRecoveryUrl("javascript:alert(1)")).protocol,
    "https:",
  );
  assert.equal(
    passwordRecoveryUrl("http://localhost:4179"),
    "http://localhost:4179/auth?mode=reset",
  );
});

test("reset credentials accept bounded scalar email-link parameters only", () => {
  assert.deepEqual(recoveryCredentials(credentials), credentials);
  for (const input of [
    {},
    { userId: ["mock-user"], secret: credentials.secret },
    { userId: "mock-user", secret: [credentials.secret] },
    { userId: "user/other", secret: credentials.secret },
    { userId: "A".repeat(37), secret: credentials.secret },
    { userId: credentials.userId, secret: "has\nwhitespace" },
    { userId: credentials.userId, secret: "A".repeat(2049) },
    { userId: credentials.userId, secret: "" },
  ])
    assert.equal(recoveryCredentials(input), null);
});

test("a reset email uses the existing account API and never returns provider tokens", async () => {
  const calls: unknown[] = [];
  const result = await requestPasswordRecovery(
    {
      createRecovery: async (input) => {
        calls.push(input);
        return { secret: "must-not-display", userId: "private-id" };
      },
    },
    " person@example.test ",
    "https://circle.example.test/auth?mode=reset",
  );
  assert.deepEqual(calls, [
    {
      email: "person@example.test",
      url: "https://circle.example.test/auth?mode=reset",
    },
  ]);
  assert.deepEqual(result, { ok: true, message: RECOVERY_EMAIL_MESSAGE });
  assert.ok(!JSON.stringify(result).includes("must-not-display"));
});

test("unknown email accounts receive the same public confirmation", async () => {
  const result = await requestPasswordRecovery(
    {
      createRecovery: async () => {
        throw { code: 404, message: "private account detail" };
      },
    },
    "nobody@example.test",
    "https://circle.example.test/auth?mode=reset",
  );
  assert.deepEqual(result, { ok: true, message: RECOVERY_EMAIL_MESSAGE });
});

test("invalid emails do not send a request; rate and network errors reveal no provider detail", async () => {
  let calls = 0;
  const account = {
    createRecovery: async () => {
      calls++;
    },
  };
  for (const email of [
    "",
    "not-an-email",
    "has space@example.test",
    `${"a".repeat(320)}@example.test`,
  ])
    assert.equal(
      (
        await requestPasswordRecovery(
          account,
          email,
          "https://circle.example.test/auth?mode=reset",
        )
      ).ok,
      false,
    );
  assert.equal(calls, 0);
  for (const code of [429, 500]) {
    const result = await requestPasswordRecovery(
      {
        createRecovery: async () => {
          throw { code, message: credentials.secret };
        },
      },
      "person@example.test",
      "https://circle.example.test/auth?mode=reset",
    );
    assert.equal(result.ok, false);
    assert.ok(!result.message.includes(credentials.secret));
    if (code === 429) assert.match(result.message, /wait/i);
  }
});

test("reset validation prevents incomplete links and mismatched passwords from reaching Appwrite", async () => {
  let calls = 0;
  const account = {
    updateRecovery: async () => {
      calls++;
    },
  };
  for (const [input, value, confirmation] of [
    [null, password, password],
    [credentials, "short", "short"],
    [credentials, password, "another-password"],
    [credentials, "x".repeat(257), "x".repeat(257)],
  ] as const)
    assert.equal(
      (await completePasswordRecovery(account, input, value, confirmation)).ok,
      false,
    );
  assert.equal(calls, 0);
});

test("a valid reset consumes only the explicit token/password without signing in", async () => {
  const calls: unknown[] = [];
  const result = await completePasswordRecovery(
    {
      updateRecovery: async (input) => {
        calls.push(input);
        return { secret: "private response" };
      },
    },
    credentials,
    password,
    password,
  );
  assert.deepEqual(calls, [{ ...credentials, password }]);
  assert.equal(result.ok, true);
  assert.match(result.message, /sign in/i);
  assert.ok(!JSON.stringify(result).includes(credentials.secret));
  assert.ok(!JSON.stringify(result).includes(password));
});

test("expired links, rate limits, and provider errors stay generic and never return token details", async () => {
  for (const code of [401, 404, 429, 400, 500]) {
    const result = await completePasswordRecovery(
      {
        updateRecovery: async () => {
          throw { code, message: `${credentials.secret} ${password}` };
        },
      },
      credentials,
      password,
      password,
    );
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes(credentials.secret));
    assert.ok(!JSON.stringify(result).includes(password));
    if ([401, 404].includes(code))
      assert.match(result.message, /expired|used/i);
    if (code === 429) assert.match(result.message, /wait/i);
  }
});
