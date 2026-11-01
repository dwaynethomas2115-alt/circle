import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { cropCover } from "./cropCover";

function browserCanvas(t: TestContext, width = 4000, height = 2000) {
  const previousImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const drawCalls: unknown[][] = [];
  const formats: unknown[][] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      fillStyle: "",
      fillRect: () => {},
      drawImage: (...args: unknown[]) => {
        drawCalls.push(args);
      },
    }),
    toDataURL: (...args: unknown[]) => {
      formats.push(args);
      return "data:image/jpeg;base64,/9j/mock-local-crop";
    },
  };
  class Photo {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | undefined;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    value: Photo,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => {
        assert.equal(tag, "canvas");
        return canvas;
      },
    },
  });
  t.after(() => {
    if (previousImage)
      Object.defineProperty(globalThis, "Image", previousImage);
    else Reflect.deleteProperty(globalThis, "Image");
    if (previousDocument)
      Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });
  return { canvas, drawCalls, formats };
}

test("web cover export encodes the selected source rectangle rather than the whole photo", async (t) => {
  const fake = browserCanvas(t);
  const result = await cropCover(
    "blob:chosen-photo",
    { width: 4000, height: 2000 },
    4,
    { zoom: 2, centerX: 0.75, centerY: 0.25 },
  );
  assert.equal(result, "data:image/jpeg;base64,/9j/mock-local-crop");
  assert.equal(fake.drawCalls.length, 1);
  assert.deepEqual(
    fake.drawCalls[0].slice(1),
    [2000, 250, 2000, 500, 0, 0, 2000, 500],
  );
  assert.deepEqual(
    { width: fake.canvas.width, height: fake.canvas.height },
    { width: 2000, height: 500 },
  );
  assert.deepEqual(fake.formats, [["image/jpeg", 0.95]]);
});

test("web export downsizes a large crop and refuses changed source dimensions", async (t) => {
  const fake = browserCanvas(t, 8000, 4000);
  await cropCover(
    "data:image/jpeg;base64,local",
    { width: 8000, height: 4000 },
    4,
    { zoom: 1, centerX: 0.5, centerY: 0.5 },
  );
  assert.deepEqual(
    { width: fake.canvas.width, height: fake.canvas.height },
    { width: 2048, height: 512 },
  );
  await assert.rejects(
    cropCover("blob:changed-photo", { width: 4000, height: 2000 }, 4, {
      zoom: 1,
      centerX: 0.5,
      centerY: 0.5,
    }),
    /size changed/,
  );
  assert.equal(
    fake.drawCalls.length,
    1,
    "mismatched dimensions never export a different crop",
  );
});

test("web crop does not fetch remote image URLs or accept invalid image geometry", async () => {
  await assert.rejects(
    cropCover(
      "https://elsewhere.example/private.jpg",
      { width: 4000, height: 2000 },
      4,
      { zoom: 1, centerX: 0.5, centerY: 0.5 },
    ),
    /local photo/,
  );
  await assert.rejects(
    cropCover("blob:photo", { width: 0, height: 2000 }, 4, {
      zoom: 1,
      centerX: 0.5,
      centerY: 0.5,
    }),
    /dimensions/,
  );
});
