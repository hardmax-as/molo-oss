import type { LessonKind } from "@molo/core";
import Svg, { Circle, Path, Rect } from "react-native-svg";

/**
 * What a node says it is (docs/DESIGN.md "The path"), drawn rather than
 * imported: the mobile app has no icon font and adding one for six glyphs
 * is not worth a dependency. Same five meanings as the web's Lucide set —
 * headphone, microphone, star, book, crown — plus a padlock and a chest.
 *
 * Every glyph is decoration: the node's `accessibilityLabel` says the kind
 * in words, so VoiceOver never has to read a picture.
 */
export function NodeIcon({
  kind,
  locked = false,
  size = 28,
  color,
}: {
  kind: LessonKind;
  locked?: boolean;
  size?: number;
  color: string;
}) {
  const common = { width: size, height: size, viewBox: "0 0 24 24" };
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, fill: "none" };

  if (locked)
    return (
      <Svg {...common}>
        <Rect x="4" y="10" width="16" height="11" rx="3" fill={color} />
        <Path d="M8 10V7a4 4 0 0 1 8 0v3" {...stroke} />
      </Svg>
    );

  switch (kind) {
    case "listen":
      return (
        <Svg {...common}>
          <Path d="M4 14v-2a8 8 0 0 1 16 0v2" {...stroke} />
          <Rect x="2.5" y="13" width="5" height="8" rx="2.5" fill={color} />
          <Rect x="16.5" y="13" width="5" height="8" rx="2.5" fill={color} />
        </Svg>
      );
    case "speak":
      return (
        <Svg {...common}>
          <Rect x="9" y="2" width="6" height="11" rx="3" fill={color} />
          <Path d="M5 11a7 7 0 0 0 14 0M12 18v4" {...stroke} />
        </Svg>
      );
    case "culture":
      return (
        <Svg {...common}>
          <Path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4Z" fill={color} />
          <Path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6Z" {...stroke} />
        </Svg>
      );
    case "test":
      return (
        <Svg {...common}>
          <Path d="M3 7l4.5 4L12 4l4.5 7L21 7l-1.8 12H4.8Z" fill={color} />
        </Svg>
      );
    default:
      return (
        <Svg {...common}>
          <Path
            d="M12 3l2.6 5.6 6 .8-4.4 4.3 1.1 6.1L12 17l-5.3 2.8 1.1-6.1L3.4 9.4l6-.8Z"
            fill={color}
          />
        </Svg>
      );
  }
}

/** The reward at the end of a skill: a small chest, open or shut. */
export function ChestIcon({
  size = 28,
  color,
  open = false,
}: {
  size?: number;
  color: string;
  open?: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y={open ? 10 : 8} width="18" height="11" rx="2.5" fill={color} />
      <Path
        d={open ? "M3 10 6 4h12l3 6" : "M3 12h18"}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx="12" cy="14" r="1.8" fill="#FFF7E8" />
    </Svg>
  );
}
