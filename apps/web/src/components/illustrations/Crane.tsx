/**
 * The mentor: a blue crane, South Africa's national bird, at home on
 * Eastern Cape grassland. Calm and tall; it appears where something is
 * explained (culture cards, grammar and click tips, the editor's pages).
 */

import { motion } from "motion/react";

import { useMotionPrefs } from "~/lib/motion.ts";

import type { SunbirdPose } from "./Sunbird.tsx";
import { surfaceProps, type MascotSurface } from "./surface.ts";

export function Crane({
  pose = "hello",
  size = 160,
  className = "",
  animate = true,
  label,
  surface = "light",
}: {
  pose?: SunbirdPose;
  size?: number;
  className?: string;
  animate?: boolean;
  /** Set only where the drawing carries meaning; without it the SVG is decorative and hidden. */
  label?: string;
  /** `dark` on the indigo sky: a cream rim keeps the indigo legs visible (./surface.ts). */
  surface?: MascotSurface;
}) {
  const { reduced } = useMotionPrefs();
  const live = animate && !reduced;
  const wave = pose === "hello" || pose === "cheer";
  const eyeClosed = pose === "sleep";
  return (
    <motion.svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={className}
      {...surfaceProps(surface)}
      animate={live ? { y: [0, -3, 0] } : {}}
      transition={live ? { duration: 2.8, repeat: Infinity, ease: "easeInOut" } : {}}
    >
      {/* legs */}
      <path
        d="M92 156 l -4 32 M108 156 l 4 32"
        stroke="#26264F"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* long trailing wing plumes, the blue crane's signature */}
      <path d="M118 130 C 150 132, 176 150, 190 178 C 166 164, 140 156, 116 150 Z" fill="#7C8FB8" />
      <path
        d="M116 138 C 144 142, 164 158, 172 180 C 152 166, 132 158, 112 152 Z"
        fill="#26264F"
        opacity="0.6"
      />
      {/* body */}
      <ellipse cx="100" cy="128" rx="40" ry="32" fill="#A9B7D6" />
      <ellipse cx="96" cy="134" rx="26" ry="20" fill="#C7D1E8" />
      {/* neck and head */}
      <path
        d="M96 106 C 92 90, 92 70, 96 56"
        stroke="#A9B7D6"
        strokeWidth="16"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="98" cy="50" r="16" fill="#C7D1E8" />
      <path d="M110 48 l 26 6 l -26 6 Z" fill="#D9772B" />
      {eyeClosed ? (
        <path
          d="M96 48 q 5 4 10 0"
          stroke="#26264F"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      ) : (
        <>
          <circle cx="102" cy="48" r="4.5" fill="#26264F" />
          <circle cx="104" cy="46" r="1.6" fill="#FFFFFF" />
        </>
      )}
      <circle cx="92" cy="56" r="3.5" fill="#E85D5D" opacity="0.5" />
      {/* near wing */}
      <motion.path
        d="M84 118 C 60 108, 40 116, 30 132 C 48 128, 68 134, 86 140 Z"
        fill="#7C8FB8"
        style={{ originX: "84px", originY: "122px", transformBox: "view-box" }}
        animate={
          live && wave
            ? { rotate: pose === "cheer" ? [0, 45, 0] : [0, 30, 0, 30, 0] }
            : { rotate: wave ? 30 : 0 }
        }
        transition={
          live
            ? pose === "cheer"
              ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
              : { duration: 1.6, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }
            : {}
        }
      />
      {pose === "cheer" && (
        <g fill="#F6B73C">
          <path d="M40 40 l 4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 Z" />
          <path d="M160 26 l 3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z" />
        </g>
      )}
      {pose === "think" && (
        <g fill="#8A8AA3">
          <circle cx="130" cy="34" r="3" />
          <circle cx="140" cy="22" r="4.5" />
          <circle cx="154" cy="8" r="6" />
        </g>
      )}
      {pose === "listen" && (
        <g stroke="#26264F" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5">
          <path d="M146 40 q 8 12 0 24" />
          <path d="M156 32 q 14 20 0 40" />
        </g>
      )}
    </motion.svg>
  );
}
