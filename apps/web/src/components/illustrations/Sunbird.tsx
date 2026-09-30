/**
 * Molo's mascot: a malachite sunbird, common in the Eastern Cape. Flat
 * shapes in the DESIGN.md palette so it sits on any surface. Poses are
 * small changes of the same drawing, which keeps it recognisable.
 * Its isiXhosa name is a question for the tutor; in code it is "the sunbird".
 */

import { motion } from "motion/react";

import { useLoop, useWaveMotion } from "~/lib/motion.ts";

import { surfaceProps, type MascotSurface } from "./surface.ts";

export type SunbirdPose = "hello" | "cheer" | "think" | "sleep" | "listen";

export function Sunbird({
  pose = "hello",
  size = 160,
  className = "",
  animate = true,
  label,
  wave,
  surface = "light",
}: {
  pose?: SunbirdPose;
  size?: number;
  className?: string;
  animate?: boolean;
  /** Set only where the drawing carries meaning; without it the SVG is decorative and hidden. */
  label?: string;
  /** `dark` on the indigo sky: a cream rim keeps the indigo tail from vanishing (./surface.ts). */
  surface?: MascotSurface;
  /**
   * A counter from `useWave()`: each rise waves the near wing once. Given
   * at all, it replaces the pose's own looping wave (except `cheer`, which
   * keeps flapping), so the bird greets on cue rather than all the time.
   */
  wave?: number;
}) {
  // The bob and the wing loops stop offscreen and under reduced motion.
  const { ref, live } = useLoop<SVGSVGElement>(animate);
  const cued = wave !== undefined && pose !== "cheer";
  const wingRef = useWaveMotion<SVGPathElement>(cued ? wave : undefined, live, 34);
  const wingUp = pose === "hello" || pose === "cheer";
  const bothWings = pose === "cheer";
  const eyeClosed = pose === "sleep";
  const tilt = pose === "think" ? -8 : pose === "listen" ? 6 : 0;
  return (
    <motion.svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={className}
      {...surfaceProps(surface)}
      ref={ref}
      animate={live ? { y: [0, -4, 0] } : { y: 0 }}
      transition={live ? { duration: 2.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
    >
      <g transform={`rotate(${tilt} 100 120)`}>
        {/* tail */}
        <path d="M78 132 C 52 150, 40 176, 46 190 C 60 176, 76 160, 92 148 Z" fill="#26264F" />
        <path d="M84 134 C 62 150, 52 172, 56 186 C 66 172, 80 158, 96 148 Z" fill="#1FA38C" />
        {/* far wing */}
        <motion.path
          d="M112 104 C 140 92, 160 100, 166 116 C 150 114, 132 120, 118 128 Z"
          fill="#17806F"
          style={{ originX: "112px", originY: "108px", transformBox: "view-box" }}
          animate={live && bothWings ? { rotate: [0, -40, 0] } : { rotate: bothWings ? -35 : 0 }}
          transition={live ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : {}}
        />
        {/* body */}
        <ellipse cx="102" cy="122" rx="40" ry="34" fill="#1FA38C" />
        <ellipse cx="108" cy="132" rx="26" ry="20" fill="#F6B73C" />
        {/* head */}
        <circle cx="120" cy="86" r="26" fill="#1FA38C" />
        <circle cx="126" cy="82" r="10" fill="#26264F" opacity="0.12" />
        {/* beak: long and curved, the sunbird's signature */}
        <path d="M142 84 C 162 84, 178 92, 190 104 C 174 100, 160 96, 142 92 Z" fill="#D9772B" />
        {/* eye */}
        {eyeClosed ? (
          <path
            d="M120 84 q 6 5 12 0"
            stroke="#26264F"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        ) : (
          <>
            <circle cx="126" cy="84" r="6" fill="#26264F" />
            <circle cx="128" cy="82" r="2" fill="#FFFFFF" />
          </>
        )}
        {/* cheek */}
        <circle cx="112" cy="94" r="5" fill="#E85D5D" opacity="0.55" />
        {/* near wing: cued, it rests and waves once per cue (useWaveMotion);
            otherwise the pose's own loop */}
        {cued ? (
          <motion.path
            ref={wingRef}
            d="M96 112 C 70 100, 46 106, 34 122 C 52 118, 74 124, 92 132 Z"
            fill="#17806F"
            style={{ originX: "96px", originY: "116px", transformBox: "view-box" }}
          />
        ) : (
          <motion.path
            d="M96 112 C 70 100, 46 106, 34 122 C 52 118, 74 124, 92 132 Z"
            fill="#17806F"
            style={{ originX: "96px", originY: "116px", transformBox: "view-box" }}
            animate={
              live && wingUp
                ? { rotate: pose === "cheer" ? [0, 40, 0] : [0, 28, 0, 28, 0] }
                : { rotate: wingUp ? 30 : 0 }
            }
            transition={
              live
                ? pose === "cheer"
                  ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 1.6, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }
                : {}
            }
          />
        )}
        {/* feet */}
        <path
          d="M96 154 l -6 14 M104 154 l 2 14 M110 154 l 8 12"
          stroke="#D9772B"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* zzz or sparkles */}
        {pose === "sleep" && (
          <text
            x="150"
            y="60"
            fontFamily="Fredoka Variable, Fredoka, sans-serif"
            fontWeight="700"
            fontSize="22"
            fill="#8A8AA3"
          >
            z z
          </text>
        )}
        {pose === "cheer" && (
          <g fill="#F6B73C">
            <path d="M60 50 l 4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 Z" />
            <path d="M168 40 l 3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z" />
          </g>
        )}
        {pose === "think" && (
          <g fill="#8A8AA3">
            <circle cx="158" cy="58" r="3" />
            <circle cx="168" cy="46" r="4.5" />
            <circle cx="182" cy="32" r="6" />
          </g>
        )}
        {pose === "listen" && (
          <g stroke="#26264F" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5">
            <path d="M170 66 q 8 12 0 24" />
            <path d="M180 58 q 14 20 0 40" />
          </g>
        )}
      </g>
    </motion.svg>
  );
}
