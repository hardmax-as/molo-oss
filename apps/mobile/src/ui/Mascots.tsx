import { useEffect, type ReactNode } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Ellipse, G, Path, Text as SvgText } from "react-native-svg";

import { useMotion } from "./motion.ts";
import { colors } from "./theme.ts";

/**
 * The three mascots from docs/DESIGN.md, drawn with the same paths as
 * apps/web/src/components/illustrations so both clients show one trio:
 * the sunbird (the voice), the penguin (the learner) and the crane (the
 * mentor). Five poses each; the pose is a small change of the same drawing.
 * They bob gently unless the OS asks for reduced motion, and they are
 * decorative, so VoiceOver skips them.
 */
export type MascotPose = "hello" | "cheer" | "think" | "sleep" | "listen";

/**
 * What the mascot stands on. `dark` is the indigo night sky behind the
 * celebrations and the indigo cards: there the penguin's body and flippers,
 * the sunbird's outer tail and the crane's legs are the ground's own indigo
 * and vanish, so the whole silhouette gets a cream rim first, the way a
 * sticker has a white edge. The bird's own colours never change.
 */
export type MascotSurface = "light" | "dark";

interface MascotProps {
  pose?: MascotPose;
  size?: number;
  animate?: boolean;
  surface?: MascotSurface;
}

const ZZZ_FONT = "Fredoka_700Bold";

/** The rim on a dark surface: sand, the page's own cream, so it reads as light rather than as a border. */
export const RIM_COLOUR = colors.sand;
/** How much of the rim shows outside the drawing, in points, at any size. */
const RIM_PT = 2.5;

/**
 * The stroke width, in the drawings' 200-unit viewBox, that leaves `RIM_PT`
 * showing outside the fill at `size`: half of a stroke lies under the fill,
 * so the stroke is twice the visible rim, scaled from points to viewBox
 * units. Clamped so a tiny mascot does not turn into a blob.
 */
export function rimWidth(size: number): number {
  return Math.min(16, Math.max(5, (2 * RIM_PT * 200) / size));
}

/**
 * The silhouette again, painted in the rim colour and stroked wider, under
 * the drawing. Children are the outline shapes only; they inherit the paint.
 */
function Rim({ size, children }: { size: number; children: ReactNode }) {
  return (
    <G
      fill={RIM_COLOUR}
      stroke={RIM_COLOUR}
      strokeWidth={rimWidth(size)}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {children}
    </G>
  );
}

function Bob({
  size,
  amount,
  duration,
  animate,
  children,
}: {
  size: number;
  amount: number;
  duration: number;
  animate: boolean;
  children: ReactNode;
}) {
  const m = useMotion();
  const live = animate && !m.reduced;
  const y = useSharedValue(0);
  useEffect(() => {
    if (!live) {
      y.value = 0;
      return;
    }
    y.value = withRepeat(
      withSequence(
        withTiming(-amount, { duration: duration / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: duration / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [live, amount, duration, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View
      style={[{ width: size, height: size }, style]}
      // A mascot is never a control. While it bobs it must not take a touch
      // meant for anything it overlaps (MOL-66); taps pass to its parent.
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </Animated.View>
  );
}

/** Sparkles, thought dots, sound arcs and the sleeping "z z", shared by the three birds. */
function Extras({
  pose,
  at,
  dark,
}: {
  pose: MascotPose;
  at: { sparkle: [number, number]; sparkle2: [number, number]; dots: [number, number] };
  dark: boolean;
}) {
  const [sx, sy] = at.sparkle;
  const [tx, ty] = at.sparkle2;
  const [dx, dy] = at.dots;
  if (pose === "sleep") {
    return (
      <SvgText x={dx} y={dy + 8} fontFamily={ZZZ_FONT} fontSize="22" fill={colors.mistSoft}>
        z z
      </SvgText>
    );
  }
  if (pose === "cheer") {
    return (
      <G fill={colors.sun}>
        <Path d={`M${sx} ${sy} l 4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 Z`} />
        <Path d={`M${tx} ${ty} l 3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z`} />
      </G>
    );
  }
  if (pose === "think") {
    return (
      <G fill={colors.mistSoft}>
        <Circle cx={dx} cy={dy} r="3" />
        <Circle cx={dx + 10} cy={dy - 12} r="4.5" />
        <Circle cx={dx + 24} cy={dy - 26} r="6" />
      </G>
    );
  }
  if (pose === "listen") {
    return (
      <G
        stroke={dark ? colors.cloud : colors.indigo}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.5"
      >
        <Path d={`M${dx + 10} ${dy + 14} q 8 12 0 24`} />
        <Path d={`M${dx + 20} ${dy + 6} q 14 20 0 40`} />
      </G>
    );
  }
  return null;
}

/** The sunbird's outline pieces, shared by the drawing and its rim so the two never drift. */
const SUNBIRD = {
  tail: "M78 132 C 52 150, 40 176, 46 190 C 60 176, 76 160, 92 148 Z",
  tailInner: "M84 134 C 62 150, 52 172, 56 186 C 66 172, 80 158, 96 148 Z",
  wingFar: "M112 104 C 140 92, 160 100, 166 116 C 150 114, 132 120, 118 128 Z",
  beak: "M142 84 C 162 84, 178 92, 190 104 C 174 100, 160 96, 142 92 Z",
  wingNear: "M96 112 C 70 100, 46 106, 34 122 C 52 118, 74 124, 92 132 Z",
  legs: "M96 154 l -6 14 M104 154 l 2 14 M110 154 l 8 12",
} as const;

/** Malachite sunbird: the voice. Appears where something is heard or said. */
export function Sunbird({
  pose = "hello",
  size = 160,
  animate = true,
  surface = "light",
}: MascotProps) {
  const wingUp = pose === "hello" || pose === "cheer";
  const both = pose === "cheer";
  const eyeClosed = pose === "sleep";
  const tilt = pose === "think" ? -8 : pose === "listen" ? 6 : 0;
  const dark = surface === "dark";
  return (
    <Bob size={size} amount={4} duration={2600} animate={animate}>
      <Svg viewBox="0 0 200 200" width={size} height={size}>
        <G rotation={tilt} originX={100} originY={120}>
          {dark && (
            <Rim size={size}>
              <Path d={SUNBIRD.tail} />
              <Path d={SUNBIRD.wingFar} rotation={both ? -35 : 0} originX={112} originY={108} />
              <Ellipse cx="102" cy="122" rx="40" ry="34" />
              <Circle cx="120" cy="86" r="26" />
              <Path d={SUNBIRD.beak} />
              <Path d={SUNBIRD.wingNear} rotation={wingUp ? 30 : 0} originX={96} originY={116} />
              <Path d={SUNBIRD.legs} fill="none" strokeWidth={4 + rimWidth(size)} />
            </Rim>
          )}
          <Path d={SUNBIRD.tail} fill={colors.indigo} />
          <Path d={SUNBIRD.tailInner} fill={colors.sea} />
          <Path
            d={SUNBIRD.wingFar}
            fill="#17806F"
            rotation={both ? -35 : 0}
            originX={112}
            originY={108}
          />
          <Ellipse cx="102" cy="122" rx="40" ry="34" fill={colors.sea} />
          <Ellipse cx="108" cy="132" rx="26" ry="20" fill={colors.sun} />
          <Circle cx="120" cy="86" r="26" fill={colors.sea} />
          <Circle cx="126" cy="82" r="10" fill={colors.indigo} opacity="0.12" />
          <Path d={SUNBIRD.beak} fill={colors.ochre} />
          {eyeClosed ? (
            <Path
              d="M120 84 q 6 5 12 0"
              stroke={colors.indigo}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          ) : (
            <>
              <Circle cx="126" cy="84" r="6" fill={colors.indigo} />
              <Circle cx="128" cy="82" r="2" fill={colors.cloud} />
            </>
          )}
          <Circle cx="112" cy="94" r="5" fill={colors.coral} opacity="0.55" />
          <Path
            d={SUNBIRD.wingNear}
            fill="#17806F"
            rotation={wingUp ? 30 : 0}
            originX={96}
            originY={116}
          />
          <Path d={SUNBIRD.legs} stroke={colors.ochre} strokeWidth="4" strokeLinecap="round" />
          <Extras
            pose={pose}
            at={{ sparkle: [60, 50], sparkle2: [168, 40], dots: [158, 58] }}
            dark={dark}
          />
        </G>
      </Svg>
    </Bob>
  );
}

/** The penguin's outline pieces, shared by the drawing and its rim. */
const PENGUIN = {
  feet: "M80 178 l -16 10 h 28 Z M110 178 l 16 10 h -28 Z",
  flipperNear: "M56 98 C 38 108, 32 134, 40 152 C 50 140, 56 122, 62 106 Z",
  flipperFar: "M144 98 C 162 108, 168 134, 160 152 C 150 140, 144 122, 138 106 Z",
} as const;

/** African penguin: the learner. Tries, gets things wrong, thinks and cheers. */
export function Penguin({
  pose = "hello",
  size = 160,
  animate = true,
  surface = "light",
}: MascotProps) {
  const wave = pose === "hello" || pose === "cheer";
  const both = pose === "cheer";
  const eyeClosed = pose === "sleep";
  const tilt = pose === "think" ? -6 : pose === "listen" ? 5 : 0;
  const dark = surface === "dark";
  const eye = (cx: number) =>
    eyeClosed ? (
      <Path
        d={`M${cx - 6} 68 q 6 5 12 0`}
        stroke={colors.indigo}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    ) : (
      <>
        <Circle cx={cx} cy="68" r="7" fill={colors.cloud} />
        <Circle cx={cx + 1} cy="68" r="3.6" fill={colors.indigo} />
        <Circle cx={cx + 2.5} cy="66.5" r="1.3" fill={colors.cloud} />
      </>
    );
  return (
    <Bob size={size} amount={3} duration={2400} animate={animate}>
      <Svg viewBox="0 0 200 200" width={size} height={size}>
        <G rotation={tilt} originX={100} originY={120}>
          {dark && (
            <Rim size={size}>
              <Path d={PENGUIN.feet} />
              <Ellipse cx="100" cy="120" rx="48" ry="62" />
              <Circle cx="100" cy="66" r="32" />
              <Path d={PENGUIN.flipperNear} rotation={wave ? 35 : 0} originX={56} originY={102} />
              <Path d={PENGUIN.flipperFar} rotation={both ? -35 : 0} originX={144} originY={102} />
            </Rim>
          )}
          <Path d={PENGUIN.feet} fill={colors.ochre} />
          <Ellipse cx="100" cy="120" rx="48" ry="62" fill={colors.indigo} />
          <Path
            d="M70 92 C 66 130, 74 172, 100 176 C 126 172, 134 130, 130 92 C 120 82, 80 82, 70 92 Z"
            fill={colors.cloud}
          />
          <Path
            d="M72 100 C 70 132, 80 156, 100 160 C 120 156, 130 132, 128 100"
            stroke={colors.indigo}
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
          />
          <Circle cx="92" cy="126" r="2.4" fill={colors.indigo} />
          <Circle cx="110" cy="138" r="2.4" fill={colors.indigo} />
          <Circle cx="98" cy="146" r="2" fill={colors.indigo} />
          <Circle cx="100" cy="66" r="32" fill={colors.indigo} />
          <Path
            d="M74 56 C 70 70, 76 86, 90 92"
            stroke={colors.cloud}
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M126 56 C 130 70, 124 86, 110 92"
            stroke={colors.cloud}
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M84 54 q 6 -5 12 0"
            stroke="#F4A6B5"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M104 54 q 6 -5 12 0"
            stroke="#F4A6B5"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
          {eye(90)}
          {eye(110)}
          <Path d="M100 74 l -9 6 l 9 9 l 9 -9 Z" fill={colors.ochre} />
          <Path
            d={PENGUIN.flipperNear}
            fill={colors.indigo}
            rotation={wave ? 35 : 0}
            originX={56}
            originY={102}
          />
          <Path
            d={PENGUIN.flipperFar}
            fill={colors.indigo}
            rotation={both ? -35 : 0}
            originX={144}
            originY={102}
          />
          <Extras
            pose={pose}
            at={{ sparkle: [42, 38], sparkle2: [160, 28], dots: [142, 42] }}
            dark={dark}
          />
        </G>
      </Svg>
    </Bob>
  );
}

/** The crane's outline pieces, shared by the drawing and its rim. */
const CRANE = {
  legs: "M92 156 l -4 32 M108 156 l 4 32",
  tail: "M118 130 C 150 132, 176 150, 190 178 C 166 164, 140 156, 116 150 Z",
  tailShade: "M116 138 C 144 142, 164 158, 172 180 C 152 166, 132 158, 112 152 Z",
  neck: "M96 106 C 92 90, 92 70, 96 56",
  beak: "M110 48 l 26 6 l -26 6 Z",
  wing: "M84 118 C 60 108, 40 116, 30 132 C 48 128, 68 134, 86 140 Z",
} as const;

/** Blue crane: the mentor. Appears where something is explained. */
export function Crane({
  pose = "hello",
  size = 160,
  animate = true,
  surface = "light",
}: MascotProps) {
  const wave = pose === "hello" || pose === "cheer";
  const eyeClosed = pose === "sleep";
  const dark = surface === "dark";
  const rim = rimWidth(size);
  return (
    <Bob size={size} amount={3} duration={2800} animate={animate}>
      <Svg viewBox="0 0 200 200" width={size} height={size}>
        {dark && (
          <Rim size={size}>
            <Path d={CRANE.legs} fill="none" strokeWidth={4 + rim} />
            <Path d={CRANE.tail} />
            <Path d={CRANE.tailShade} />
            <Ellipse cx="100" cy="128" rx="40" ry="32" />
            <Path d={CRANE.neck} fill="none" strokeWidth={16 + rim} />
            <Circle cx="98" cy="50" r="16" />
            <Path d={CRANE.beak} />
            <Path d={CRANE.wing} rotation={wave ? 30 : 0} originX={84} originY={122} />
          </Rim>
        )}
        <Path d={CRANE.legs} stroke={colors.indigo} strokeWidth="4" strokeLinecap="round" />
        <Path d={CRANE.tail} fill="#7C8FB8" />
        <Path d={CRANE.tailShade} fill={colors.indigo} opacity="0.6" />
        <Ellipse cx="100" cy="128" rx="40" ry="32" fill="#A9B7D6" />
        <Ellipse cx="96" cy="134" rx="26" ry="20" fill="#C7D1E8" />
        <Path d={CRANE.neck} stroke="#A9B7D6" strokeWidth="16" strokeLinecap="round" fill="none" />
        <Circle cx="98" cy="50" r="16" fill="#C7D1E8" />
        <Path d={CRANE.beak} fill={colors.ochre} />
        {eyeClosed ? (
          <Path
            d="M96 48 q 5 4 10 0"
            stroke={colors.indigo}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        ) : (
          <>
            <Circle cx="102" cy="48" r="4.5" fill={colors.indigo} />
            <Circle cx="104" cy="46" r="1.6" fill={colors.cloud} />
          </>
        )}
        <Circle cx="92" cy="56" r="3.5" fill={colors.coral} opacity="0.5" />
        <Path d={CRANE.wing} fill="#7C8FB8" rotation={wave ? 30 : 0} originX={84} originY={122} />
        <Extras
          pose={pose}
          at={{ sparkle: [40, 40], sparkle2: [160, 26], dots: [130, 34] }}
          dark={dark}
        />
      </Svg>
    </Bob>
  );
}
