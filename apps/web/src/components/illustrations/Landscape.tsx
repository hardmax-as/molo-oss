/**
 * Eastern Cape at first light: sun, layered hills, an aloe. Pure shapes in
 * the palette; sized by its container, so it works as a hero band or a
 * small empty-state picture.
 */

import { motion } from "motion/react";

import { useLoop } from "~/lib/motion.ts";

export function Landscape({
  className = "",
  withSun = true,
  label,
}: {
  className?: string;
  withSun?: boolean;
  /** Set only where the band carries meaning; without it the SVG is decorative and hidden. */
  label?: string;
}) {
  const { ref, live, reduced } = useLoop<SVGSVGElement>();
  return (
    <svg
      ref={ref}
      viewBox="0 0 800 260"
      className={className}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      preserveAspectRatio="xMidYMax slice"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF7E8" />
          <stop offset="1" stopColor="#FCE7B8" />
        </linearGradient>
      </defs>
      <rect width="800" height="260" fill="url(#sky)" />
      {withSun && (
        <motion.circle
          cx="600"
          cy="120"
          r="58"
          fill="#F6B73C"
          initial={reduced ? false : { cy: 170, opacity: 0.6 }}
          animate={{ cy: 120, opacity: 1 }}
          transition={{ duration: reduced ? 0 : 1.4, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      <circle cx="600" cy="120" r="78" fill="#F6B73C" opacity="0.18" />
      {/* hills, far to near */}
      <path
        d="M0 200 C 120 150, 220 160, 330 180 C 430 198, 520 150, 620 165 C 700 176, 760 170, 800 160 L 800 260 L 0 260 Z"
        fill="#6DBBA7"
      />
      <path
        d="M0 220 C 100 190, 200 205, 300 215 C 420 226, 500 190, 610 205 C 700 217, 760 210, 800 200 L 800 260 L 0 260 Z"
        fill="#1FA38C"
      />
      <path
        d="M0 245 C 140 225, 260 240, 400 238 C 540 236, 660 222, 800 236 L 800 260 L 0 260 Z"
        fill="#D9772B"
      />
      {/* aloe. On a phone the sliced viewBox puts it right behind the landing
          page's penguin, where its flower reads as a hat; it appears from sm up. */}
      <g transform="translate(430 205)" className="hidden sm:inline">
        <path d="M0 40 C -4 20, -10 8, -26 -6 C -8 6, -2 20, 2 40 Z" fill="#17806F" />
        <path d="M2 40 C 0 18, 6 4, 14 -12 C 8 6, 6 20, 6 40 Z" fill="#1FA38C" />
        <path d="M4 40 C 10 22, 20 12, 34 2 C 18 14, 12 26, 8 40 Z" fill="#17806F" />
        <path d="M-2 40 C -8 24, -16 14, -30 6 C -14 16, -8 28, -4 40 Z" fill="#1FA38C" />
        <path d="M6 0 l 0 -34" stroke="#D9772B" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="6" cy="-38" rx="7" ry="12" fill="#E85D5D" />
      </g>
      {/* birds: two arcs that drift slowly across and flap out of step. The
          flap squashes each arc through its own baseline (scaleY only), the
          drift is a long transform on the group: nothing here touches layout. */}
      {/* Phones centre the hero text over the whole sky, so the birds would
          fly through it; they appear from sm up, where the text sits left. */}
      <motion.g
        className="hidden sm:inline"
        stroke="#26264F"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
        animate={live ? { x: [0, 36, 0], y: [0, -6, 0] } : { x: 0, y: 0 }}
        transition={live ? { duration: 22, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
      >
        <motion.path
          d="M300 70 q 8 -8 16 0 q 8 -8 16 0"
          style={{ originX: "316px", originY: "70px", transformBox: "view-box" }}
          animate={live ? { scaleY: [1, -0.5, 1] } : { scaleY: 1 }}
          transition={
            live
              ? { duration: 0.9, repeat: Infinity, repeatDelay: 1.6, ease: "easeInOut" }
              : { duration: 0 }
          }
        />
        <motion.path
          d="M350 92 q 6 -6 12 0 q 6 -6 12 0"
          style={{ originX: "362px", originY: "92px", transformBox: "view-box" }}
          animate={live ? { scaleY: [1, -0.5, 1] } : { scaleY: 1 }}
          transition={
            live
              ? { duration: 0.8, repeat: Infinity, repeatDelay: 2.1, delay: 0.7, ease: "easeInOut" }
              : { duration: 0 }
          }
        />
      </motion.g>
    </svg>
  );
}
