import { motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

import { riseVariants, useMotionPrefs } from "~/lib/motion.ts";

/** A rounded-3xl surface that rises in on mount (DESIGN.md "Enter"). `index` staggers siblings. */
export function Card({
  children,
  className = "",
  index = 0,
  tone = "cloud",
  ...rest
}: Omit<HTMLMotionProps<"div">, "children"> & {
  children: ReactNode;
  className?: string;
  index?: number;
  tone?: "cloud" | "indigo" | "sun" | "sea" | "sand";
}) {
  const { reduced } = useMotionPrefs();
  const tones = {
    cloud: "bg-cloud text-ink shadow-card",
    indigo: "bg-indigo text-white shadow-pop",
    sun: "bg-sun-soft text-indigo",
    sea: "bg-sea-soft text-indigo",
    sand: "bg-sand-deep text-ink",
  };
  return (
    <motion.div
      variants={riseVariants(reduced)}
      initial="hidden"
      animate="show"
      custom={index}
      className={`rounded-3xl p-5 ${tones[tone]} ${className}`}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
