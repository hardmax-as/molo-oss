import {
  createLinkDrawMemory,
  LINK_DASH_START,
  LINK_STYLE,
  linkDrawWindow,
  linkHalf,
  nodeOffsetOf,
  type GuideSpeech,
  type LinkCurve,
  type LinkState,
  type NodeLinks,
  type NodeOffset,
  type PathChestRow,
  type PathLessonRow,
  type PathLink,
  type PathStopRow,
  type PathUnitRow,
} from "@molo/core";
import { useIsFocused } from "expo-router";
import { memo, useEffect, useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  createAnimatedComponent,
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Line, Path } from "react-native-svg";

import { useContentTitle, useT } from "~/lib/i18n.tsx";
import { Crane } from "~/ui/Mascots.tsx";
import { useMotion } from "~/ui/motion.ts";
import { ChestIcon, NodeIcon } from "~/ui/PathIcons.tsx";
import { colors } from "~/ui/theme.ts";

/**
 * The pieces one stretch of path is drawn from. They live here rather than
 * inside the unit screen so that a row is all they need: the screen feeds
 * them rows from `unitPathRows`, and the developer gallery feeds them
 * fabricated ones. The same components either way — a gallery that drew its
 * own copies would drift and then lie.
 */

/** How far off the spine a node sits; the same winding the web path draws. */
export const SHIFT = { "-1": -LINK_STYLE.shift, "0": 0, "1": LINK_STYLE.shift } as const;

/** The row's vertical padding (`py-3`), which the trail's geometry counts on. */
const ROW_PAD = 12;
/** Sizes the trail meets: the node's diameter, the current node's, the chest's height. */
const NODE = { lesson: 76, current: 92, chest: 64 } as const;
/** Space between a node and the guide beside it. */
const GUIDE_GAP = 8;

/** The current node breathes so the eye finds it; reduced motion stills it. */
export function useIdlePulse(active: boolean) {
  const scale = useSharedValue(1);
  const m = useMotion();
  const live = active && !m.reduced;
  useEffect(() => {
    if (!live) {
      scale.value = 1;
      return;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [live, scale]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

/**
 * One stepping stone. The icon comes from what the lesson drills, the badge
 * carries its crown level, and the accessible label always says the kind and
 * the state in words — the drawing is never the only signal.
 */
export function LessonNode({ row, onPress }: { row: PathLessonRow; onPress: () => void }) {
  const t = useT();
  const m = useMotion();
  const pulse = useIdlePulse(row.state === "current");
  const kind = t(`path.kind.${row.kind}` as never);
  const state =
    row.state === "done"
      ? `${t("path.state.done")}, ${t("path.state.crown", { level: row.crownLevel })}`
      : row.state === "locked"
        ? t("path.state.locked")
        : row.state === "current"
          ? t("path.state.current")
          : t("path.state.open");
  const meta = `${t("units.minutes", { count: row.estimatedMinutes })} · ${t("units.exercises", {
    count: row.exerciseCount,
  })}`;
  const size = row.state === "current" ? NODE.current : NODE.lesson;
  const skin =
    row.state === "locked"
      ? { bg: colors.cloud, edge: colors.cloudDeep, ink: colors.mist }
      : row.state === "done"
        ? { bg: colors.sea, edge: colors.seaDeep, ink: colors.cloud }
        : row.state === "current"
          ? { bg: colors.sun, edge: colors.sunDeep, ink: colors.ink }
          : { bg: colors.cloud, edge: colors.cloudDeep, ink: colors.indigo };

  // The winding shift sits on a view of its own. The idle pulse is a
  // transform too, and a style array keeps only the last transform, so on
  // one view the pulse put every node back on the centre line and the trail
  // missed them.
  return (
    <View style={{ transform: [{ translateX: SHIFT[String(row.offset) as "0"] }] }}>
      <Animated.View
        entering={FadeInDown.duration(m.enter).delay(Math.min(row.index, 8) * m.stagger)}
        style={pulse}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: row.state === "locked" }}
          accessibilityLabel={`${t("path.node", { kind, order: row.order, state })}. ${meta}`}
          disabled={row.state === "locked"}
          onPress={onPress}
          testID={`lesson-${row.order}`}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: skin.bg,
            borderBottomWidth: 6,
            borderColor: skin.edge,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <NodeIcon
            kind={row.kind}
            locked={row.state === "locked"}
            size={row.state === "current" ? 34 : 28}
            color={skin.ink}
          />
        </Pressable>
        {row.crownLevel > 0 && (
          <View
            className="absolute -right-1 -top-1 h-7 min-w-7 items-center justify-center rounded-full bg-sun px-1.5"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text className="font-display-bold text-xs text-ink">{row.crownLevel}</Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

/** The reward at the end of a skill: opens once, and the server keeps the receipt. */
export function ChestNode({
  row,
  busy,
  onClaim,
}: {
  row: PathChestRow;
  busy: boolean;
  onClaim: () => void;
}) {
  const t = useT();
  const m = useMotion();
  const pulse = useIdlePulse(row.state === "ready");
  const label =
    row.state === "ready"
      ? t("path.chest.ready", { xp: row.xp })
      : row.state === "claimed"
        ? t("path.chest.claimed", { xp: row.xp })
        : t("path.chest.locked", { skill: t(row.titleKey as never) || row.skillId });
  const skin =
    row.state === "ready"
      ? { bg: colors.sun, edge: colors.sunDeep, ink: colors.ink }
      : row.state === "claimed"
        ? { bg: colors.cloud, edge: colors.seaDeep, ink: colors.sea }
        : { bg: colors.cloud, edge: colors.cloudDeep, ink: colors.mist };
  return (
    <Animated.View entering={FadeInDown.duration(m.enter)} style={pulse} className="items-center">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: row.state !== "ready" || busy }}
        accessibilityLabel={busy ? t("path.chest.opening") : label}
        disabled={row.state !== "ready" || busy}
        onPress={onClaim}
        testID={`chest-${row.skillId}`}
        style={{
          width: 84,
          height: NODE.chest,
          borderRadius: 18,
          backgroundColor: skin.bg,
          borderBottomWidth: 6,
          borderColor: skin.edge,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ChestIcon size={30} color={skin.ink} open={row.state === "claimed"} />
      </Pressable>
      {row.state !== "locked" && (
        <Text
          className="mt-1 font-display-bold text-xs text-ochre-deep"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {t("path.chest.reward", { xp: row.xp })}
        </Text>
      )}
    </Animated.View>
  );
}

/**
 * The crane is the mentor (docs/DESIGN.md "Illustration"), so it stands
 * beside the node the learner is being pointed at. The bubble appears on
 * the very first visit and after a long absence, and never in between; it
 * sits over the crane's head, and both lean towards the node on `side`.
 */
export function PathGuide({
  speak,
  side = "right",
}: {
  speak: GuideSpeech;
  /** Which side of the node the crane stands on. */
  side?: "left" | "right";
}) {
  const t = useT();
  return (
    <View className={side === "left" ? "items-end" : "items-start"}>
      {speak !== null && (
        <View
          className="mb-1 max-w-[10rem] rounded-2xl bg-cloud px-3 py-2"
          accessibilityRole="text"
          accessibilityLabel={`${t("path.guide.name")}: ${
            speak === "first" ? t("onboarding.ready.body") : t("lesson.keepGoing")
          }`}
        >
          <Text className="font-body-semibold text-xs text-indigo">
            {speak === "first" ? t("onboarding.ready.body") : t("lesson.keepGoing")}
          </Text>
        </View>
      )}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Crane pose={speak === "first" ? "hello" : "think"} size={72} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The trail between the nodes
// ---------------------------------------------------------------------------

/** `a` over `b` at `share`: an opaque tint, so two halves meeting never double up. */
function mix(a: string, b: string, share: number): string {
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) =>
    Math.round(channel(a, i) * share + channel(b, i) * (1 - share))
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${out.join("")}`;
}

/** Walked is the done colour; the rest is mist on sand, like the web. */
const TRAIL: Record<LinkState, string> = {
  done: colors.sea,
  ahead: mix(colors.mist, colors.sand, 0.45),
  locked: mix(colors.mist, colors.sand, 0.22),
};

const AnimatedPath = createAnimatedComponent(Path);
const drawMemory = createLinkDrawMemory();

/**
 * The newest walked link draws itself on once, the first time the learner
 * sees it walked — which is when this screen is back in front after a
 * lesson, not while the lesson still covers it. Under reduced motion it is
 * simply there.
 */
function DrawOnPath({
  link,
  half,
  curve,
}: {
  link: PathLink;
  half: keyof NodeLinks;
  curve: LinkCurve;
}) {
  const focused = useIsFocused();
  const m = useMotion();
  const full = Math.ceil(curve.length) + 1;
  const hidden = useSharedValue(0);
  const { key, unitId } = link;
  useEffect(() => {
    if (!focused) return;
    const now = Date.now();
    const started = drawMemory.start({ key, unitId }, now);
    if (started === null || m.reduced) return;
    const turn = linkDrawWindow(half, started, now);
    if (!turn) return;
    hidden.value = 1;
    hidden.value = withDelay(
      turn.delay,
      withTiming(0, {
        duration: turn.duration,
        easing: half === "below" ? Easing.in(Easing.quad) : Easing.out(Easing.quad),
      }),
    );
    return () => {
      cancelAnimation(hidden);
      hidden.value = 0;
    };
  }, [focused, key, unitId, half, m.reduced, hidden]);
  // Each half's path starts at the shared row edge. The upper stop's half
  // grows from its node towards that edge (from the path's end), the lower
  // stop's from the edge towards its node (from the path's start).
  const sign = half === "below" ? -1 : 1;
  const animated = useAnimatedProps(() => ({ strokeDashoffset: sign * full * hidden.value }));
  return (
    <AnimatedPath
      d={curve.d}
      stroke={TRAIL.done}
      strokeWidth={LINK_STYLE.stroke}
      strokeLinecap="round"
      fill="none"
      strokeDasharray={[full, full]}
      animatedProps={animated}
    />
  );
}

/**
 * One half of a link, in a box as tall as half the row: the top half for
 * the link arriving from above, the bottom half (the same drawing, flipped)
 * for the link leaving below. The curve reaches the node's centre at
 * `reach`; a straight run carries on to the row's middle, so a row made
 * taller by the guide's bubble still meets its node.
 */
function LinkHalfView({
  link,
  half,
  self,
  reach,
}: {
  link: PathLink;
  half: keyof NodeLinks;
  self: NodeOffset;
  reach: number;
}) {
  const other = half === "above" ? link.from : link.to;
  const curve = useMemo(() => linkHalf({ self, other, reach }), [self, other, reach]);
  const x = curve.points[3].x;
  const dashed = link.state !== "done";
  const dash = [LINK_STYLE.dash, LINK_STYLE.gap];
  const curveDash = dashed ? { strokeDasharray: dash, strokeDashoffset: LINK_DASH_START } : {};
  const runDash = dashed ? { strokeDasharray: dash, strokeDashoffset: curve.runDashOffset } : {};
  const stroke = TRAIL[link.state];
  return (
    <View
      style={[
        styles.half,
        half === "above" ? { top: 0 } : { bottom: 0, transform: [{ scaleY: -1 }] },
      ]}
    >
      <Svg width={LINK_STYLE.width} height="100%">
        {link.latest && link.state === "done" ? (
          <DrawOnPath link={link} half={half} curve={curve} />
        ) : (
          <Path
            d={curve.d}
            stroke={stroke}
            strokeWidth={LINK_STYLE.stroke}
            strokeLinecap="round"
            fill="none"
            {...curveDash}
          />
        )}
        <Line
          x1={x}
          y1={reach}
          x2={x}
          y2="100%"
          stroke={stroke}
          strokeWidth={LINK_STYLE.stroke}
          strokeLinecap="round"
          {...runDash}
        />
      </Svg>
    </View>
  );
}

/**
 * The trail behind one row's node: first in the row, so everything else
 * draws over it. Memoised: the screen keeps `links` stable while its rows
 * are, so a chest claim or the guide's speech does not redraw every row.
 */
const StopLinks = memo(function StopLinks({
  links,
  self,
  reach,
  index,
}: {
  links: NodeLinks;
  self: NodeOffset;
  reach: number;
  index: number;
}) {
  const m = useMotion();
  return (
    <Animated.View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      entering={FadeIn.duration(m.enter).delay(Math.min(index, 8) * m.stagger)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="path-link"
    >
      {links.above && <LinkHalfView link={links.above} half="above" self={self} reach={reach} />}
      {links.below && <LinkHalfView link={links.below} half="below" self={self} reach={reach} />}
    </Animated.View>
  );
});

/** Row edge to where the trail meets the node: the padding plus half the node. */
function reachOf(row: PathStopRow): number {
  if (row.type === "chest") return ROW_PAD + NODE.chest / 2;
  return ROW_PAD + (row.state === "current" ? NODE.current : NODE.lesson) / 2;
}

/**
 * One stop on the path, laid out so the trail can find it: the node dead
 * centre plus its own winding shift, the trail's halves behind it, and —
 * when `guide` is given — the crane beside it on the side the winding
 * leaves open (left of a node stepped right, otherwise right). The guide
 * stays in the row's flow, so a bubble makes the row taller rather than
 * spilling over the rows around it, and never moves the node.
 *
 * `guide` is the crane's speech; `null` is a silent crane, and leaving it
 * out means no crane at all.
 */
export function PathStop({
  row,
  links,
  guide,
  children,
}: {
  row: PathStopRow;
  links: NodeLinks | undefined;
  guide?: GuideSpeech | undefined;
  children: ReactNode;
}) {
  const offset = nodeOffsetOf(row);
  const side = offset > 0 ? "left" : "right";
  // Stepped away from the guide's side, the node leaves its shift free there.
  const lean = offset === 0 ? GUIDE_GAP : GUIDE_GAP - LINK_STYLE.shift;
  const crane = guide !== undefined && <PathGuide speak={guide} side={side} />;
  return (
    <View className="flex-row items-center" style={styles.stop}>
      {links && (links.above || links.below) && (
        <StopLinks links={links} self={offset} reach={reachOf(row)} index={row.index} />
      )}
      <View className="flex-1 items-end">
        {side === "left" && crane && <View style={{ marginRight: lean }}>{crane}</View>}
      </View>
      {children}
      <View className="flex-1 items-start">
        {side === "right" && crane && <View style={{ marginLeft: lean }}>{crane}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stop: { paddingVertical: ROW_PAD },
  half: {
    position: "absolute",
    left: "50%",
    marginLeft: -LINK_STYLE.width / 2,
    width: LINK_STYLE.width,
    height: "50%",
  },
});

/** The section header: it stays put for the whole of its unit's stretch. */
export function UnitBanner({ row }: { row: PathUnitRow }) {
  const t = useT();
  const title = useContentTitle();
  const name = title(row.titleKey, row.unitSlug);
  const prerequisite = row.prerequisiteTitleKey
    ? title(row.prerequisiteTitleKey, row.prerequisiteSlug ?? "")
    : (row.prerequisiteSlug ?? "");
  return (
    <View className="bg-sand pb-3 pt-1">
      <View
        className={`flex-row items-center gap-3 rounded-2xl px-4 py-3 ${
          row.locked ? "bg-cloud" : "bg-indigo"
        }`}
        testID="path-unit-banner"
      >
        <View className="flex-1">
          <Text
            className={`font-body-bold text-[11px] uppercase tracking-wide ${
              row.locked ? "text-mist" : "text-sun"
            }`}
          >
            {t("path.unit", { number: row.unitNumber })} · {row.cefrBand}
          </Text>
          <Text
            className={`font-display text-lg ${row.locked ? "text-mist" : "text-cloud"}`}
            numberOfLines={1}
          >
            {name}
          </Text>
        </View>
        <Text
          className={`font-body-semibold text-sm ${row.locked ? "text-mist" : "text-cloud/80"}`}
        >
          {row.locked
            ? t("units.lockedHint", { unit: prerequisite })
            : t("path.unitProgress", { done: row.done, total: row.total })}
        </Text>
      </View>
    </View>
  );
}
