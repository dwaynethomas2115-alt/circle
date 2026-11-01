import test from "node:test";
import assert from "node:assert/strict";
import { copyLink, shareLink } from "./share";

const content = {
  title: "Join me on Circle",
  message: "A private place for our photos and conversations.",
  url: "https://circle.example/welcome",
};
test("system sharing receives the intended public link and never copies after cancellation", async () => {
  const calls: unknown[] = [];
  let copies = 0;
  assert.equal(
    await shareLink(content, {
      share: async (data) => {
        calls.push(data);
      },
      clipboard: {
        writeText: async () => {
          copies++;
        },
      },
    }),
    "shared",
  );
  assert.deepEqual(calls, [
    { title: content.title, text: content.message, url: content.url },
  ]);
  assert.equal(copies, 0);
  assert.equal(
    await shareLink(content, {
      share: async () => {
        throw Object.assign(new Error("Dismissed"), { name: "AbortError" });
      },
      clipboard: {
        writeText: async () => {
          copies++;
        },
      },
    }),
    "cancelled",
  );
  assert.equal(copies, 0);
});
test("unsupported or denied sharing copies only the link, with manual fallback on clipboard denial", async () => {
  const copied: string[] = [];
  assert.equal(
    await shareLink(content, {
      clipboard: {
        writeText: async (value) => {
          copied.push(value);
        },
      },
    }),
    "copied",
  );
  assert.equal(
    await shareLink(content, {
      share: async () => {
        throw new Error("Unavailable");
      },
      clipboard: {
        writeText: async (value) => {
          copied.push(value);
        },
      },
    }),
    "copied",
  );
  assert.deepEqual(copied, [content.url, content.url]);
  assert.equal(await copyLink(content.url, {}), "manual");
  assert.equal(
    await shareLink(content, {
      share: async () => {
        throw new Error("Unavailable");
      },
      clipboard: {
        writeText: async () => {
          throw new Error("Denied");
        },
      },
    }),
    "manual",
  );
});
