import { loadedImageDimensions } from "./imageLoading";

/** RN Web's async decode callback may lose Event.target. Read the Image's
 * existing accessibility <img> instead; never start another image request.
 */
export function observeImageDimensions(
  event: unknown,
  node: unknown,
  onDimensions: (size: { width: number; height: number }) => void,
): () => void {
  const fromEvent = loadedImageDimensions(event);
  if (fromEvent) {
    onDimensions(fromEvent);
    return () => {};
  }
  const root = node as {
    querySelector?: (selector: string) => HTMLImageElement | null;
  } | null;
  const image = root?.querySelector?.("img");
  if (!image) return () => {};
  const read = () => loadedImageDimensions({ target: image });
  const ready = read();
  if (ready) {
    onDimensions(ready);
    return () => {};
  }
  let active = true;
  const cleanup = () => {
    active = false;
    image.removeEventListener("load", loaded);
    image.removeEventListener("error", cleanup);
  };
  const loaded = () => {
    if (!active) return;
    const size = read();
    cleanup();
    if (size) onDimensions(size);
  };
  image.addEventListener("load", loaded, { once: true });
  image.addEventListener("error", cleanup, { once: true });
  return cleanup;
}
