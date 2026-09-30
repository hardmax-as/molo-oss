/**
 * The learner's companion: an African penguin, endemic to South Africa and
 * Namibia; the largest colony lives on St Croix Island off Gqeberha in the
 * Eastern Cape. Black head with the white face stripe, a horseshoe band on
 * the chest, pink above the eyes. Same poses as the sunbird.
 */

import { motion } from "motion/react";
import { useState } from "react";

import { useLoop, useWaveMotion } from "~/lib/motion.ts";

import type { SunbirdPose } from "./Sunbird.tsx";
import { surfaceProps, type MascotSurface } from "./surface.ts";

export function Penguin({
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
  /** `dark` on the indigo sky: a cream rim keeps the indigo body and flippers visible (./surface.ts). */
  surface?: MascotSurface;
  /** A counter from `useWave()`; see the sunbird. Each rise waves the near flipper once. */
  wave?: number;
}) {
  // The bob, the blink and the flipper loops stop offscreen and under reduced motion.
  const { ref, live } = useLoop<SVGSVGElement>(animate);
  const cued = wave !== undefined && pose !== "cheer";
  const flipperRef = useWaveMotion<SVGPathElement>(cued ? wave : undefined, live, 40);
  const waving = pose === "hello" || pose === "cheer";
  // Each penguin blinks on its own clock, so two side by side never blink in step.
  const [blinkDelay] = useState(() => 2 + Math.random() * 3);
  const both = pose === "cheer";
  const eyeClosed = pose === "sleep";
  const tilt = pose === "think" ? -6 : pose === "listen" ? 5 : 0;
  const eye = (cx: number) =>
    eyeClosed ? (
      <path
        d={`M${cx - 6} 68 q 6 5 12 0`}
        stroke="#26264F"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    ) : (
      <>
        <circle cx={cx} cy="68" r="7" fill="#FFFFFF" />
        <circle cx={cx + 1} cy="68" r="3.6" fill="#26264F" />
        <circle cx={cx + 2.5} cy="66.5" r="1.3" fill="#FFFFFF" />
      </>
    );
  return (
    <motion.svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={className}
      {...surfaceProps(surface)}
      ref={ref}
      animate={live ? { y: [0, -3, 0] } : { y: 0 }}
      transition={live ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
    >
      <g transform={`rotate(${tilt} 100 120)`}>
        {/* feet */}
        <path d="M80 178 l -16 10 h 28 Z M110 178 l 16 10 h -28 Z" fill="#D9772B" />
        {/* body */}
        <ellipse cx="100" cy="120" rx="48" ry="62" fill="#26264F" />
        {/* white front */}
        <path
          d="M70 92 C 66 130, 74 172, 100 176 C 126 172, 134 130, 130 92 C 120 82, 80 82, 70 92 Z"
          fill="#FFFFFF"
        />
        {/* horseshoe chest band */}
        <path
          d="M72 100 C 70 132, 80 156, 100 160 C 120 156, 130 132, 128 100"
          stroke="#26264F"
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
        {/* the few chest spots every bird has differently */}
        <circle cx="92" cy="126" r="2.4" fill="#26264F" />
        <circle cx="110" cy="138" r="2.4" fill="#26264F" />
        <circle cx="98" cy="146" r="2" fill="#26264F" />
        {/* head */}
        <circle cx="100" cy="66" r="32" fill="#26264F" />
        {/* white face stripes curving around the cheeks */}
        <path
          d="M74 56 C 70 70, 76 86, 90 92"
          stroke="#FFFFFF"
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M126 56 C 130 70, 124 86, 110 92"
          stroke="#FFFFFF"
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
        {/* pink glands above the eyes */}
        <path
          d="M84 54 q 6 -5 12 0"
          stroke="#F4A6B5"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M104 54 q 6 -5 12 0"
          stroke="#F4A6B5"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        {/* An occasional blink: both eyes squash to a line and open again, a
            tenth of a second every few seconds. */}
        <motion.g
          style={{ originX: "100px", originY: "68px", transformBox: "view-box" }}
          animate={live && !eyeClosed ? { scaleY: [1, 0.1, 1] } : { scaleY: 1 }}
          transition={
            live && !eyeClosed
              ? {
                  duration: 0.16,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatDelay: blinkDelay + 2,
                  delay: blinkDelay,
                }
              : { duration: 0 }
          }
        >
          {eye(90)}
          {eye(110)}
        </motion.g>
        {/* beak */}
        <path d="M100 74 l -9 6 l 9 9 l 9 -9 Z" fill="#D9772B" />
        {/* flippers. The px origins are viewBox coordinates: Motion defaults SVG
            elements to transform-box: fill-box, which would measure them from
            the flipper's own box and swing it away from the shoulder. */}
        {cued ? (
          <motion.path
            ref={flipperRef}
            d="M56 98 C 38 108, 32 134, 40 152 C 50 140, 56 122, 62 106 Z"
            fill="#26264F"
            style={{ originX: "56px", originY: "102px", transformBox: "view-box" }}
          />
        ) : (
          <motion.path
            d="M56 98 C 38 108, 32 134, 40 152 C 50 140, 56 122, 62 106 Z"
            fill="#26264F"
            style={{ originX: "56px", originY: "102px", transformBox: "view-box" }}
            animate={
              live && waving
                ? { rotate: both ? [0, 50, 0] : [0, 40, 0, 40, 0] }
                : { rotate: waving ? 35 : 0 }
            }
            transition={
              live
                ? both
                  ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 1.6, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }
                : {}
            }
          />
        )}
        <motion.path
          d="M144 98 C 162 108, 168 134, 160 152 C 150 140, 144 122, 138 106 Z"
          fill="#26264F"
          style={{ originX: "144px", originY: "102px", transformBox: "view-box" }}
          animate={live && both ? { rotate: [0, -50, 0] } : { rotate: both ? -35 : 0 }}
          transition={live ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : {}}
        />
        {pose === "sleep" && (
          <text
            x="138"
            y="40"
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
            <path d="M42 38 l 4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 Z" />
            <path d="M160 28 l 3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z" />
          </g>
        )}
        {pose === "think" && (
          <g fill="#8A8AA3">
            <circle cx="142" cy="42" r="3" />
            <circle cx="152" cy="30" r="4.5" />
            <circle cx="166" cy="16" r="6" />
          </g>
        )}
        {pose === "listen" && (
          <g stroke="#26264F" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5">
            <path d="M152 56 q 8 12 0 24" />
            <path d="M162 48 q 14 20 0 40" />
          </g>
        )}
      </g>
    </motion.svg>
  );
}
