import { useEffect, useRef, useState } from "react";
import { Platform, type View } from "react-native";

/** Defer heavy web media requests until near the scrolling viewport. Once
 * activated, keep the media mounted: scrolling back must not restart it.
 * Native and browsers without IntersectionObserver retain normal rendering.
 */
export function useMediaActivation() {
  const ref = useRef<View>(null);
  const [active, setActive] = useState(
    Platform.OS !== "web" || typeof IntersectionObserver === "undefined",
  );
  useEffect(() => {
    if (active) return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node || typeof node.getBoundingClientRect !== "function") {
      setActive(true);
      return;
    }
    let root = node.parentElement;
    while (root) {
      if (/^(auto|scroll)$/.test(getComputedStyle(root).overflowY)) break;
      root = root.parentElement;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          setActive(true);
        }
      },
      { root, rootMargin: "800px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [active]);
  return { ref, active };
}
