import test from "node:test";
import assert from "node:assert/strict";
import {
  imageAccessScope,
  imageMediaIdentity,
  isSignedPrivateImage,
  loadedImageDimensions,
} from "./imageLoading";

const uri =
  "https://private.test/v1/storage/buckets/circle-media/files/photo-1/view?project=first&token=old";

test("drawn image identity ignores only signing credentials, never file/project/rendition", () => {
  assert.equal(
    imageMediaIdentity(uri),
    imageMediaIdentity(uri.replace("old", "fresh")),
  );
  for (const next of [
    uri.replace("private.test", "another.test"),
    uri.replace("photo-1", "photo-2"),
    uri.replace("project=first", "project=second"),
    `${uri}&rendition=thumbnail`,
    uri.replace("circle-media", "another-bucket"),
    uri.replace("/view", "/download"),
  ])
    assert.notEqual(imageMediaIdentity(uri), imageMediaIdentity(next));
  assert.notEqual(
    imageMediaIdentity("https://unknown.test/photo?token=one"),
    imageMediaIdentity("https://unknown.test/photo?token=two"),
  );
  assert.equal(isSignedPrivateImage(uri), true);
  assert.equal(
    isSignedPrivateImage("blob:https://circle.test/new-photo"),
    false,
  );
});

test("image scope invalidates old pixels on account, membership, or role change", () => {
  const memberships = [
    { userId: "alex", circleId: "family", role: "member" },
    { userId: "alex", circleId: "trip", role: "owner" },
    { userId: "sam", circleId: "family", role: "member" },
  ];
  const scope = imageAccessScope("alex", memberships, "family");
  assert.equal(
    scope,
    imageAccessScope("alex", [...memberships].reverse(), "family"),
  );
  assert.equal(
    scope,
    imageAccessScope("alex", memberships.slice(0, 2), "family"),
  );
  assert.notEqual(scope, imageAccessScope("sam", memberships, "family"));
  assert.notEqual(scope, imageAccessScope(undefined, memberships, "family"));
  assert.notEqual(scope, imageAccessScope("alex", [], "family"));
  assert.notEqual(
    scope,
    imageAccessScope(
      "alex",
      memberships.map((m) =>
        m.userId === "alex" && m.circleId === "family"
          ? { ...m, role: "admin" }
          : m,
      ),
      "family",
    ),
  );
  assert.notEqual(
    imageAccessScope("alex", memberships),
    imageAccessScope("alex", memberships.slice(0, 1)),
  );
});

test("loaded dimensions come from the existing native/web image request", () => {
  assert.deepEqual(
    loadedImageDimensions({
      nativeEvent: { source: { width: 1200, height: 800 } },
    }),
    { width: 1200, height: 800 },
  );
  assert.deepEqual(
    loadedImageDimensions({
      // React Native Web wraps the HTML load Event inside nativeEvent.
      nativeEvent: { target: { naturalWidth: 600, naturalHeight: 800 } },
    }),
    { width: 600, height: 800 },
  );
  assert.deepEqual(
    loadedImageDimensions({
      target: { naturalWidth: 800, naturalHeight: 1200 },
    }),
    { width: 800, height: 1200 },
  );
  for (const event of [
    null,
    {},
    { target: {} },
    { target: { naturalWidth: 0, naturalHeight: 800 } },
    { nativeEvent: { source: { width: NaN, height: 800 } } },
    { target: { naturalWidth: "1200", naturalHeight: 800 } },
  ])
    assert.equal(loadedImageDimensions(event), null);
});
