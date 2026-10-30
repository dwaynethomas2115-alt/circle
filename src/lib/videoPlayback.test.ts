import test from "node:test";
import assert from "node:assert/strict";
import {
  captureVideoPlayback,
  restoreVideoPlayback,
  videoMediaIdentity,
} from "./videoPlayback";

test("Supabase signed token rotation preserves movie identity without merging different resources", () => {
  const base =
    "https://project.test/storage/v1/object/sign/circle-media/circle/user/video.mp4";
  assert.equal(
    videoMediaIdentity(`${base}?token=old`),
    videoMediaIdentity(`${base}?token=new`),
  );
  assert.notEqual(
    videoMediaIdentity(`${base}?token=old`),
    videoMediaIdentity(`${base.replace("video.mp4", "other.mp4")}?token=old`),
  );
  assert.notEqual(
    videoMediaIdentity(`${base}?token=old`),
    videoMediaIdentity(
      `${base.replace("project.test", "other.test")}?token=old`,
    ),
  );
  assert.notEqual(
    videoMediaIdentity(`${base}?token=old&rendition=small`),
    videoMediaIdentity(`${base}?token=new&rendition=large`),
  );
  assert.notEqual(
    videoMediaIdentity("https://other.test/video?id=first&token=a"),
    videoMediaIdentity("https://other.test/video?id=second&token=b"),
  );
  assert.notEqual(
    videoMediaIdentity("https://other.test/video?token=a"),
    videoMediaIdentity("https://other.test/video?token=b"),
  );
  assert.notEqual(
    videoMediaIdentity("blob:https://circle.test/first"),
    videoMediaIdentity("blob:https://circle.test/second"),
  );
});

test("Appwrite private media token rotation preserves identity and retains file, project, and rendition selectors", () => {
  const base =
    "https://cloud.appwrite.test/v1/storage/buckets/circle-media/files/44444444-4444-4444-8444-444444444444/view";
  const current = `${base}?project=circle-project&token=current`;
  assert.equal(
    videoMediaIdentity(current),
    videoMediaIdentity(`${base}?token=renewed&project=circle-project`),
  );
  assert.notEqual(
    videoMediaIdentity(current),
    videoMediaIdentity(`${base}?project=other-project&token=renewed`),
  );
  assert.notEqual(
    videoMediaIdentity(current),
    videoMediaIdentity(
      `${base.replace("44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555")}?project=circle-project&token=renewed`,
    ),
  );
  assert.notEqual(
    videoMediaIdentity(`${current}&rendition=small`),
    videoMediaIdentity(
      `${base}?project=circle-project&token=renewed&rendition=large`,
    ),
  );
  assert.notEqual(
    videoMediaIdentity(current),
    videoMediaIdentity(
      `${base.replace("cloud.appwrite.test", "other.test")}?project=circle-project&token=renewed`,
    ),
  );
  for (const otherPath of [
    base.replace("circle-media", "other-bucket"),
    base.replace("/view", "/download"),
    base.replace("/v1/storage/", "/unrelated/storage/"),
  ]) {
    assert.notEqual(
      videoMediaIdentity(`${otherPath}?project=circle-project&token=current`),
      videoMediaIdentity(`${otherPath}?project=circle-project&token=renewed`),
    );
  }
});

test("known signed CDN credentials rotate while resource selectors remain distinct", () => {
  assert.equal(
    videoMediaIdentity(
      "https://cdn.test/video.mp4?X-Amz-Signature=old&X-Amz-Date=yesterday&version=3",
    ),
    videoMediaIdentity(
      "https://cdn.test/video.mp4?version=3&X-Amz-Signature=new&X-Amz-Date=today",
    ),
  );
  assert.equal(
    videoMediaIdentity(
      "https://cdn.test/video.mp4?X-Goog-Signature=old&X-Goog-Date=yesterday",
    ),
    videoMediaIdentity(
      "https://cdn.test/video.mp4?X-Goog-Signature=new&X-Goog-Date=today",
    ),
  );
  assert.equal(
    videoMediaIdentity(
      "https://cdn.test/video.mp4?Signature=old&Key-Pair-Id=key&Expires=1",
    ),
    videoMediaIdentity(
      "https://cdn.test/video.mp4?Signature=new&Key-Pair-Id=key&Expires=2",
    ),
  );
});

test("failed video recovery restores position, sound, speed, and prior playback intent", () => {
  for (const playing of [true, false]) {
    const snapshot = captureVideoPlayback(
      {
        currentTime: 132.5,
        playing: false,
        muted: false,
        volume: 0.4,
        playbackRate: 1.25,
      },
      playing,
    );
    const calls: string[] = [];
    const replacement = {
      currentTime: 0,
      duration: 600,
      muted: true,
      volume: 1,
      playbackRate: 1,
      play: () => {
        calls.push("play");
      },
      pause: () => {
        calls.push("pause");
      },
    };
    restoreVideoPlayback(replacement, snapshot);
    assert.equal(replacement.currentTime, 132.5);
    assert.equal(replacement.muted, false);
    assert.equal(replacement.volume, 0.4);
    assert.equal(replacement.playbackRate, 1.25);
    assert.deepEqual(calls, [playing ? "play" : "pause"]);
  }
});

test("recovery clamps invalid values and a shorter replacement duration", () => {
  const snapshot = captureVideoPlayback({
    currentTime: 200,
    playing: true,
    muted: true,
    volume: Infinity,
    playbackRate: NaN,
  });
  const replacement = {
    currentTime: 0,
    duration: 180,
    muted: false,
    volume: 0,
    playbackRate: 2,
    play() {},
    pause() {},
  };
  restoreVideoPlayback(replacement, snapshot);
  assert.equal(replacement.currentTime, 180);
  assert.equal(replacement.volume, 1);
  assert.equal(replacement.playbackRate, 1);
});
