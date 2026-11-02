import { loadedImageDimensions } from "./imageLoading";

/** Native dimensions arrive with the already completed image load. */
export function observeImageDimensions(
  event: unknown,
  _node: unknown,
  onDimensions: (size: { width: number; height: number }) => void,
): () => void {
  const size = loadedImageDimensions(event);
  if (size) onDimensions(size);
  return () => {};
}
