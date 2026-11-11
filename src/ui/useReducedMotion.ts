import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** Start without motion, then follow the device/browser preference live. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        changed = true;
        if (active) setReduced(value);
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active && !changed) setReduced(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);
  return reduced;
}
