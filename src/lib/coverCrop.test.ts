import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_COVER_TRANSFORM,
  MAX_COVER_ZOOM,
  coverCropRect,
  coverOutputSize,
  moveCoverCrop,
  normalizeCoverTransform,
} from "./coverCrop";

test("wide cover frames select the centered source region from landscape and portrait photos", () => {
  assert.deepEqual(coverCropRect({ width: 4000, height: 3000 }, 4), {
    originX: 0,
    originY: 1000,
    width: 4000,
    height: 1000,
  });
  assert.deepEqual(coverCropRect({ width: 1000, height: 3000 }, 4), {
    originX: 0,
    originY: 1375,
    width: 1000,
    height: 250,
  });
  assert.deepEqual(coverCropRect({ width: 6000, height: 2000 }, 3), {
    originX: 0,
    originY: 0,
    width: 6000,
    height: 2000,
  });
});

test("zoom narrows the saved region around the chosen focal point and clamps to photo edges", () => {
  const image = { width: 4000, height: 3000 };
  assert.deepEqual(
    coverCropRect(image, 4, { zoom: 2, centerX: 0.5, centerY: 0.5 }),
    {
      originX: 1000,
      originY: 1250,
      width: 2000,
      height: 500,
    },
  );
  assert.deepEqual(
    coverCropRect(image, 4, { zoom: 2, centerX: 0, centerY: 0 }),
    {
      originX: 0,
      originY: 0,
      width: 2000,
      height: 500,
    },
  );
  assert.deepEqual(
    coverCropRect(image, 4, { zoom: 2, centerX: 1, centerY: 1 }),
    {
      originX: 2000,
      originY: 2500,
      width: 2000,
      height: 500,
    },
  );
});

test("dragging the displayed photo moves the crop in the opposite direction at its actual zoom", () => {
  const image = { width: 4000, height: 3000 };
  const start = { zoom: 2, centerX: 0.5, centerY: 0.5 };
  const moved = moveCoverCrop(image, 4, start, 0.2, -0.5);
  assert.deepEqual(coverCropRect(image, 4, moved), {
    originX: 600,
    originY: 1500,
    width: 2000,
    height: 500,
  });
  assert.deepEqual(start, { zoom: 2, centerX: 0.5, centerY: 0.5 });
  assert.deepEqual(
    coverCropRect(image, 4, moveCoverCrop(image, 4, start, 100, 100)),
    { originX: 0, originY: 0, width: 2000, height: 500 },
  );
  assert.deepEqual(
    coverCropRect(image, 4, moveCoverCrop(image, 4, start, -100, -100)),
    { originX: 2000, originY: 2500, width: 2000, height: 500 },
  );
});

test("every frame and drag remains inside the original, including tiny and unusual aspect ratios", () => {
  for (const image of [
    { width: 1, height: 1 },
    { width: 1, height: 4096 },
    { width: 8000, height: 1 },
    { width: 4033, height: 3025 },
  ]) {
    for (const aspect of [0.2, 1, 2.3, 5.2, 100]) {
      for (const zoom of [1, 1.75, MAX_COVER_ZOOM]) {
        for (const center of [-100, 0.5, 100]) {
          const rect = coverCropRect(image, aspect, {
            zoom,
            centerX: center,
            centerY: center,
          });
          for (const coordinate of Object.values(rect))
            assert.ok(Number.isInteger(coordinate));
          assert.ok(rect.width >= 1 && rect.height >= 1);
          assert.ok(rect.originX >= 0 && rect.originY >= 0);
          assert.ok(rect.originX + rect.width <= image.width);
          assert.ok(rect.originY + rect.height <= image.height);
        }
      }
    }
  }
});

test("invalid photo/frame sizes fail, while nonfinite gesture values cannot corrupt a valid crop", () => {
  for (const bad of [0, -1, 0.5, NaN, Infinity]) {
    assert.throws(
      () => coverCropRect({ width: bad, height: 100 }, 3),
      /dimensions/,
    );
    assert.throws(
      () => coverCropRect({ width: 100, height: bad }, 3),
      /dimensions/,
    );
  }
  for (const bad of [0, -1, NaN, Infinity])
    assert.throws(
      () => coverCropRect({ width: 100, height: 100 }, bad),
      /dimensions/,
    );
  const image = { width: 4000, height: 3000 };
  const reset = normalizeCoverTransform(image, 4, {
    zoom: NaN,
    centerX: NaN,
    centerY: NaN,
  });
  assert.deepEqual(reset, DEFAULT_COVER_TRANSFORM);
  assert.deepEqual(moveCoverCrop(image, 4, reset, NaN, Infinity), reset);
  assert.equal(
    normalizeCoverTransform(image, 4, { ...reset, zoom: Infinity }).zoom,
    MAX_COVER_ZOOM,
  );
  assert.equal(
    normalizeCoverTransform(image, 4, { ...reset, zoom: -Infinity }).zoom,
    1,
  );
});

test("JPEG output sizing reduces large crops without enlarging smaller selections", () => {
  assert.deepEqual(coverOutputSize({ width: 4000, height: 1000 }), {
    width: 2048,
    height: 512,
  });
  assert.deepEqual(coverOutputSize({ width: 360, height: 120 }), {
    width: 360,
    height: 120,
  });
  assert.deepEqual(coverOutputSize({ width: 1, height: 4096 }), {
    width: 1,
    height: 2048,
  });
  assert.deepEqual(coverOutputSize({ width: 1500, height: 500 }, 1024), {
    width: 1024,
    height: 341,
  });
  assert.throws(
    () => coverOutputSize({ width: 500, height: 200 }, 0),
    /invalid/,
  );
});
