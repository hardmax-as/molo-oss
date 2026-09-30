/** Small pictograms for skill kinds on the unit path, drawn in the palette. */

export function SkillGlyph({ kind, size = 40 }: { kind: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    "aria-hidden": true,
  };
  switch (kind) {
    case "pronunciation":
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="22" fill="#FFF0C8" />
          <path d="M14 20 h6 l8 -7 v22 l-8 -7 h-6 Z" fill="#26264F" />
          <path
            d="M32 18 q 5 6 0 12 M36 14 q 9 10 0 20"
            stroke="#1FA38C"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      );
    case "grammar":
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="22" fill="#E4F4F0" />
          <rect x="12" y="14" width="10" height="10" rx="2" fill="#1FA38C" />
          <rect x="26" y="14" width="10" height="10" rx="2" fill="#F6B73C" />
          <rect x="12" y="26" width="24" height="8" rx="2" fill="#26264F" />
        </svg>
      );
    case "culture":
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="22" fill="#FDE3E3" />
          <circle cx="24" cy="20" r="6" fill="#26264F" />
          <path d="M12 38 c 2 -10, 22 -10, 24 0 Z" fill="#E85D5D" />
          <circle cx="36" cy="12" r="4" fill="#F6B73C" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="22" fill="#FFF0C8" />
          <path
            d="M14 30 l 8 -14 l 8 14 M17 25 h10"
            stroke="#26264F"
            strokeWidth="3.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="34" cy="16" r="4" fill="#1FA38C" />
        </svg>
      );
  }
}
