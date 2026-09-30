import { motion } from "motion/react";
import type { ReactNode } from "react";

import { useMotionPrefs } from "~/lib/motion.ts";

/**
 * Progress is a ring (DESIGN.md). `value` is 0..1; the stroke animates to
 * it. Children sit in the middle: a number, a flame, a crown.
 */
export function ProgressRing({
  value,
  size = 64,
  stroke = 8,
  tone = "sea",
  track = "rgb(38 38 79 / 0.08)",
  children,
  label,
  className = "",
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: "sea" | "sun" | "indigo" | "coral";
  track?: string;
  children?: ReactNode;
  label?: string;
  className?: string;
}) {
  const { reduced } = useMotionPrefs();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const colour = { sea: "#1FA38C", sun: "#F6B73C", indigo: "#26264F", coral: "#E85D5D" }[tone];
  return (
    <span
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      // Without a label the ring is decoration beside text that already says
      // the number; with one it is the picture that carries it.
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: reduced ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  );
}
