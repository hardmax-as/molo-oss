import { useEffect, useRef, useState } from "react";

import { countAt } from "./easing.ts";
import { timing } from "./theme.ts";

export { countAt, easeOut } from "./easing.ts";

/**
 * Animates a number towards `target` over `duration` ms on the JS thread.
 * Numbers that celebrate count up (docs/DESIGN.md); with `instant` they jump.
 */
export function useCountUp(
  target: number,
  duration: number = timing.countUp,
  instant = false,
): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (instant || duration <= 0) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = Date.now();
    const begin = from.current;
    let raf = 0;
    const tick = () => {
      const t = (Date.now() - start) / duration;
      setShown(countAt(begin, target, t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, instant]);
  return shown;
}
