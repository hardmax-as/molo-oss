import { animate, motion, useMotionValue } from "motion/react";
import { useEffect, useState } from "react";

import { popTransition, useMotionPrefs } from "~/lib/motion.ts";

/** Counts up to `value` (DESIGN.md: XP counts up over 800 ms). `delta` shows as "+N". */
export function XpChip({
  value,
  delta = false,
  size = "md",
  className = "",
  duration = 0.8,
}: {
  value: number;
  delta?: boolean;
  size?: "sm" | "md" | "xl";
  className?: string;
  duration?: number;
}) {
  const { reduced } = useMotionPrefs();
  const mv = useMotionValue(0);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const controls = animate(mv, value, {
      duration: reduced ? 0 : duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, mv, reduced, duration]);
  const sizes = { sm: "px-2 py-0.5 text-sm", md: "px-3 py-1 text-base", xl: "px-5 py-2 text-4xl" };
  return (
    <motion.span
      initial={reduced ? false : { scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={popTransition}
      className={`inline-flex items-center gap-1 rounded-full bg-sun font-display font-bold text-indigo ${sizes[size]} ${className}`}
    >
      {delta ? "+" : ""}
      {shown} XP
    </motion.span>
  );
}
