import { motion } from "motion/react";

/**
 * The drawings behind the end-of-lesson beats (docs/DESIGN.md "After a
 * lesson"). Flat shapes in the palette, no gradients beyond the two the
 * medal and the crown need, and every one of them decorative: the words
 * beside them carry the meaning.
 */

/** Sun rays radiating from behind the number; they turn slowly unless motion is reduced. */
export function Rays({ reduced, tone = "sun" }: { reduced: boolean; tone?: "sun" | "sea" }) {
  // Pale, not saturated: mid-opacity sun on deep indigo reads as brown mud,
  // where a near-cream tint reads as shafts of light.
  const colour = tone === "sea" ? "#9FEADC" : "#FFE3A3";
  const id = `celebration-rays-${tone}`;
  const spokes = Array.from({ length: 12 }, (_, i) => i);
  return (
    <motion.svg
      viewBox="-100 -100 200 200"
      className="pointer-events-none absolute left-1/2 top-1/2 h-[17rem] w-[17rem] -translate-x-1/2 -translate-y-1/2"
      aria-hidden
      initial={reduced ? { opacity: 0.7, rotate: 0 } : { opacity: 0, scale: 0.7, rotate: 0 }}
      animate={reduced ? { opacity: 0.7 } : { opacity: 0.9, scale: 1, rotate: 360 }}
      transition={
        reduced
          ? { duration: 0.15 }
          : {
              opacity: { duration: 0.5 },
              scale: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
              rotate: { duration: 90, ease: "linear", repeat: Infinity },
            }
      }
    >
      <defs>
        {/* Faded at the rim, so the rays end in light rather than in an edge. */}
        <radialGradient id={id} cx="0" cy="0" r="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={colour} stopOpacity="0.42" />
          <stop offset="55%" stopColor={colour} stopOpacity="0.2" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </radialGradient>
      </defs>
      {spokes.map((i) => (
        <polygon
          key={i}
          points="0,0 -7,-96 7,-96"
          fill={`url(#${id})`}
          opacity={i % 2 === 0 ? 1 : 0.5}
          transform={`rotate(${(i * 360) / spokes.length})`}
        />
      ))}
    </motion.svg>
  );
}

const SPARKS = [
  { x: -120, y: -70, s: 14, d: 0.15 },
  { x: 108, y: -92, s: 10, d: 0.3 },
  { x: 132, y: 28, s: 16, d: 0.45 },
  { x: -138, y: 34, s: 11, d: 0.25 },
  { x: -60, y: -118, s: 9, d: 0.5 },
  { x: 66, y: 104, s: 12, d: 0.4 },
];

/** Four-pointed sparkles that pop in around the number. Nothing renders under reduced motion. */
export function Sparkles({ reduced }: { reduced: boolean }) {
  if (reduced) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {SPARKS.map((p, i) => (
        <motion.svg
          key={i}
          viewBox="0 0 24 24"
          width={p.s}
          height={p.s}
          className="absolute left-1/2 top-1/2"
          style={{ marginLeft: p.x, marginTop: p.y }}
          initial={{ scale: 0, opacity: 0, rotate: -30 }}
          animate={{ scale: [0, 1, 0.85], opacity: [0, 1, 0.75], rotate: 0 }}
          transition={{ delay: 0.25 + p.d, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <path d="M12 0c1.2 7.4 3.4 9.6 12 12-8.6 2.4-10.8 4.6-12 12-1.2-7.4-3.4-9.6-12-12 8.6-2.4 10.8-4.6 12-12z" />
        </motion.svg>
      ))}
    </div>
  );
}

/** The milestone medal: a sun disc on a sea ribbon with the round number on it. */
export function Medal({ words, label }: { words: number; label: string }) {
  return (
    <svg viewBox="0 0 120 140" width={148} height={172} role="img" aria-label={label}>
      <path d="M32 6h20l14 34H46z" fill="#1FA38C" />
      <path d="M88 6H68L54 40h20z" fill="#157A68" />
      <circle cx="60" cy="88" r="44" fill="#D9772B" />
      <circle cx="60" cy="84" r="42" fill="#F6B73C" />
      <circle cx="60" cy="84" r="33" fill="none" stroke="#D9772B" strokeWidth="3" opacity="0.7" />
      <text
        x="60"
        y="84"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-display)"
        fontWeight="700"
        fontSize={words >= 100 ? 30 : 36}
        fill="#26264F"
      >
        {words}
      </text>
    </svg>
  );
}

const CROWN_PATH = "M14 88 L4 22l34 26L70 8l32 40 34-26-10 66z";

/** The unit crown. `flawless` gives the higher tier: gold with a shimmer instead of sea. */
export function Crown({
  flawless,
  label,
  reduced,
}: {
  flawless: boolean;
  label: string;
  reduced: boolean;
}) {
  const body = flawless ? "#F6B73C" : "#1FA38C";
  const edge = flawless ? "#D9772B" : "#157A68";
  return (
    <motion.svg
      viewBox="0 0 140 110"
      width={168}
      height={132}
      role="img"
      aria-label={label}
      initial={reduced ? { opacity: 0 } : { scale: 0.4, y: -30, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={
        reduced ? { duration: 0.15 } : { type: "spring", stiffness: 220, damping: 13, delay: 0.1 }
      }
    >
      <path d={CROWN_PATH} fill={body} />
      <path d="M14 88h112l3 14H11z" fill={edge} />
      <circle cx="4" cy="18" r="7" fill={edge} />
      <circle cx="70" cy="4" r="7" fill={edge} />
      <circle cx="136" cy="18" r="7" fill={edge} />
      <circle cx="42" cy="66" r="6" fill="#FFF7E8" opacity="0.85" />
      <circle cx="70" cy="60" r="7" fill="#FFF7E8" opacity="0.85" />
      <circle cx="98" cy="66" r="6" fill="#FFF7E8" opacity="0.85" />
      {flawless && !reduced && (
        <>
          <defs>
            <linearGradient id="crown-shimmer" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
              <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
            {/* The sweep stays on the gold; outside it, a white band on the
                night sky would read as a grey smear. */}
            <clipPath id="crown-clip">
              <path d={CROWN_PATH} />
            </clipPath>
          </defs>
          <g clipPath="url(#crown-clip)">
            <motion.rect
              y="0"
              width="46"
              height="110"
              fill="url(#crown-shimmer)"
              animate={{ x: [-60, 150] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "linear", repeatDelay: 0.8 }}
            />
          </g>
        </>
      )}
    </motion.svg>
  );
}
