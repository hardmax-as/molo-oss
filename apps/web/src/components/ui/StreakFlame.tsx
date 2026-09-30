import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { popTransition, useMotionPrefs } from "~/lib/motion.ts";

/**
 * The streak flame (DESIGN.md "Streak"): a living flicker while lit, grey
 * when the streak is 0, and a pop of the day count when it grows.
 */
export function StreakFlame({
  days,
  size = 28,
  showCount = true,
  label,
  className = "",
}: {
  days: number;
  size?: number;
  showCount?: boolean;
  /** Accessible name, e.g. "3 day streak"; the visual only shows the number. */
  label?: string;
  className?: string;
}) {
  const { reduced } = useMotionPrefs();
  const lit = days > 0;
  const prev = useRef(days);
  const [popKey, setPopKey] = useState(0);
  useEffect(() => {
    if (days > prev.current) setPopKey((k) => k + 1);
    prev.current = days;
  }, [days]);
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <span
        className={`inline-block origin-bottom ${lit && !reduced ? "animate-flicker" : ""}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <svg viewBox="0 0 24 28" width={size} height={size}>
          <defs>
            <linearGradient id="flame" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#D9772B" />
              <stop offset="55%" stopColor="#F6B73C" />
              <stop offset="100%" stopColor="#FFE58F" />
            </linearGradient>
          </defs>
          <path
            d="M12 1c1 5 6 7 6 13a6 6 0 0 1-12 0c0-2 .8-3.6 2-5 .3 1.6 1.2 2.6 2.4 3C9.6 8 10 4 12 1z"
            fill={lit ? "url(#flame)" : "#C9C9D6"}
          />
          <path
            d="M12 12c1 2 2.6 3 2.6 5a2.6 2.6 0 0 1-5.2 0c0-2 1.6-3 2.6-5z"
            fill={lit ? "#FFF4D6" : "#E6E6EF"}
          />
        </svg>
      </span>
      {showCount && (
        <motion.span
          key={popKey}
          initial={popKey > 0 && !reduced ? { scale: 1.6, y: -4 } : false}
          animate={{ scale: 1, y: 0 }}
          transition={popTransition}
          className={`font-display text-lg font-bold ${lit ? "text-ochre-deep" : "text-mist"}`}
        >
          {days}
        </motion.span>
      )}
    </span>
  );
}
