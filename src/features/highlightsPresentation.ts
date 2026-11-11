import type { Post, PostAttachment } from "../types";
import { getPostMedia } from "../lib/postMedia";

export type HighlightFrame = {
  id: string;
  post: Post;
  attachment?: PostAttachment;
  photoIndex: number;
};

/** Reconcile snapshots with the current permitted feed, including deletion and
 * signed-URL replacement. Frame identity depends on the post/album slot, not a
 * short-lived access token, so refreshes do not replay the entrance animation.
 */
export function highlightFrames(
  snapshot: readonly Post[],
  currentFeed: readonly Post[],
): HighlightFrame[] {
  const allowed = new Map(currentFeed.map((post) => [post.id, post]));
  return snapshot.flatMap<HighlightFrame>((oldPost) => {
    const post = allowed.get(oldPost.id);
    if (!post || post.circleId !== oldPost.circleId) return [];
    const media = getPostMedia(post);
    return media.length
      ? media.map((attachment, photoIndex) => ({
          id: `${post.id}:${photoIndex}`,
          post,
          attachment,
          photoIndex,
        }))
      : [{ id: `${post.id}:text`, post, photoIndex: 0 }];
  });
}
