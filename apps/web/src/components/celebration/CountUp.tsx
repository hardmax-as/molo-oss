import { animate, motion, useMotionValue } from "motion/react";
import { useEffect, useState } from "react";

/**
 * A number that counts up from zero and lands with a small overshoot
 * (docs/DESIGN.md "After a lesson"). With motion reduced the number is
 * simply there: no count, no pop.
 */
export function CountUp({
  value,
  reduced,
  duration = 0.9,
  className = "",
  suffix = "",
}: {
  value: number;
  reduced: boolean;
  duration?: number;
  className?: string;
  suffix?: string;
}) {
  const mv = useMotionValue(0);
  const [shown, setShown] = useState(reduced ? value : 0);
  const [landed, setLanded] = useState(reduced);
  useEffect(() => {
    if (reduced) {
      setShown(value);
      setLanded(true);
      return;
    }
    setLanded(false);
    const controls = animate(mv, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(Math.round(v)),
      onComplete: () => setLanded(true),
    });
    return () => controls.stop();
  }, [value, reduced, duration, mv]);
  return (
    <motion.span
      className={`inline-block tabular-nums ${className}`}
      animate={landed && !reduced ? { scale: [1, 1.16, 1] } : { scale: 1 }}
      transition={{ duration: 0.36, ease: [0.2, 0.9, 0.3, 1.4], times: [0, 0.45, 1] }}
    >
      {shown}
      {suffix}
    </motion.span>
  );
}
