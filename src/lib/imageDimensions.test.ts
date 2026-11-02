import test from "node:test";
import assert from "node:assert/strict";
import { observeImageDimensions as observeWeb } from "./imageDimensions.web";

function fixture(width = 0, height = 0) {
  const listeners = new Map<string, () => void>();
  const image = {
    naturalWidth: width,
    naturalHeight: height,
    addEventListener: (event: string, listener: () => void) =>
      listeners.set(event, listener),
    removeEventListener: (event: string, listener: () => void) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    },
  };
  return {
    image,
    listeners,
    node: {
      querySelector: (selector: string) => {
        assert.equal(selector, "img");
        return image;
      },
    },
  };
}

test("RN Web decode with null event target reads the already mounted portrait image", () => {
  const h = fixture(600, 800);
  const sizes: unknown[] = [];
  const cleanup = observeWeb(
    { nativeEvent: { target: null } },
    h.node,
    (size) => sizes.push(size),
  );
  assert.deepEqual(sizes, [{ width: 600, height: 800 }]);
  assert.equal(h.listeners.size, 0);
  cleanup();
});

test("a not-yet-ready DOM image reports dimensions once and removes listeners", () => {
  const h = fixture();
  const sizes: unknown[] = [];
  const cleanup = observeWeb(
    { nativeEvent: { target: null } },
    h.node,
    (size) => sizes.push(size),
  );
  assert.equal(h.listeners.size, 2);
  h.image.naturalWidth = 600;
  h.image.naturalHeight = 800;
  const loaded = h.listeners.get("load")!;
  loaded();
  loaded();
  assert.deepEqual(sizes, [{ width: 600, height: 800 }]);
  assert.equal(h.listeners.size, 0);
  cleanup();
});

test("unmount, replacement, or image error removes pending dimension callbacks", () => {
  for (const failure of [false, true]) {
    const h = fixture();
    const sizes: unknown[] = [];
    const cleanup = observeWeb(null, h.node, (size) => sizes.push(size));
    const lateLoad = h.listeners.get("load")!;
    if (failure) h.listeners.get("error")!();
    else cleanup();
    h.image.naturalWidth = 600;
    h.image.naturalHeight = 800;
    lateLoad();
    assert.deepEqual(sizes, []);
    assert.equal(h.listeners.size, 0);
  }
});

test("native-shaped source dimensions require no DOM lookup or secondary request", () => {
  const sizes: unknown[] = [];
  const node = {
    querySelector: () => {
      throw new Error("native must not query DOM");
    },
  };
  observeWeb(
    { nativeEvent: { source: { width: 1200, height: 900 } } },
    node,
    (size) => sizes.push(size),
  );
  assert.deepEqual(sizes, [{ width: 1200, height: 900 }]);
  observeWeb(null, null, () => {
    throw new Error("missing image has no dimensions");
  });
});
