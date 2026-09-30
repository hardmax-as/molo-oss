import type { UnitResponse } from "@molo/core";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import {
  audioRefsOf,
  estimateBytes,
  formatBytes,
  type DownloadStop,
} from "~/lib/download-logic.ts";
import { useT } from "~/lib/i18n.tsx";
import { usePlus } from "~/lib/plus.tsx";
import {
  cancelDownload,
  deleteDownload,
  downloadKey,
  startDownload,
  useDownloads,
  type ActiveDownload,
  type DownloadsSnapshot,
} from "~/lib/use-downloads.ts";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { haptic } from "~/ui/haptics.ts";
import { nativeUiAvailable } from "~/ui/native-ui.ts";
import { Sheet } from "~/ui/Sheet.tsx";
import { colors } from "~/ui/theme.ts";

/**
 * "Take this unit offline" (docs/CACHING.md section 2.1). The expected South
 * African audience are visitors on a two or three week trip: expensive data,
 * and long stretches of no signal in the Kruger, the Karoo or on the road.
 * This is the control that lets them prepare on hotel wifi.
 *
 * On the unit screen it is one small pill at the end of the header line, so
 * the path starts where it always did. The detail — what it will cost, the
 * progress, why it stopped, the way to remove it — is one tap away in a
 * sheet, and inline under the line where the native sheet is not linked.
 *
 * The size is shown before a byte is spent, the progress counts real files,
 * and the whole thing can be stopped. There is no half-downloaded state to
 * render because there is no half-downloaded state: a stop of any kind
 * leaves the unit exactly as it was.
 *
 * Starting a download is a Molo Plus perk (docs/MONETISATION.md): on the free
 * plan the pill says so and opens /plus. A unit already on the phone, or a
 * download already running, stays usable whatever the plan: a lapsed
 * subscription, or a download from before the perk was gated, never takes
 * away what is there.
 */

const ERROR_KEY = {
  offline: "units.download.errorOffline",
  no_space: "units.download.errorNoSpace",
  missing_audio: "units.download.errorMissingAudio",
  failed: "units.download.errorFailed",
  cancelled: "units.download.errorFailed",
} as const satisfies Record<DownloadStop, string>;

/** What the control shows for one unit. */
export type OfflineState =
  | { readonly kind: "ready"; readonly bytes: number }
  | { readonly kind: "active"; readonly progress: ActiveDownload; readonly percent: number }
  /** Free plan, nothing on the phone, nothing running: the pill sells Plus. */
  | { readonly kind: "plus" }
  | { readonly kind: "idle"; readonly failure: DownloadStop | null };

/**
 * The one place that decides. A download on the phone or under way wins over
 * the plan; only starting a new one asks for Plus.
 */
export function offlineStateOf(
  downloads: DownloadsSnapshot,
  key: string,
  plan: "free" | "plus",
): OfflineState {
  const ready = downloads.ready.get(key);
  if (ready) return { kind: "ready", bytes: ready.bytes };
  const active = downloads.active.get(key);
  if (active) {
    const percent = active.total > 0 ? Math.round((active.done / active.total) * 100) : 0;
    return { kind: "active", progress: active, percent };
  }
  if (plan !== "plus") return { kind: "plus" };
  return { kind: "idle", failure: downloads.failed.get(key) ?? null };
}

/** Decorative glyphs: every pill and button says what it does in words. */
function DownloadGlyph({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 4v11M7 10l5 5 5-5M5 20h14"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function CheckGlyph({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke={color}
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** Progress is a ring (docs/DESIGN.md); this one is small enough to sit in a pill. */
function MiniRing({ percent, size = 16 }: { percent: number; size?: number }) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={colors.sandDeep}
        strokeWidth={stroke}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={colors.seaDeep}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(100, percent)) / 100)}
      />
    </Svg>
  );
}

const PILL_TONE = {
  plus: "bg-sun-soft border-sun",
  idle: "bg-cloud border-cloud-deep",
  failed: "bg-coral-soft border-coral",
  active: "bg-cloud border-cloud-deep",
  ready: "bg-sea-soft border-sea",
} as const;

const PILL_TEXT = {
  plus: "text-ink",
  idle: "text-ink",
  failed: "text-coral-deep",
  active: "text-ink",
  ready: "text-sea-deep",
} as const;

function Pill({
  tone,
  glyph,
  label,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityValue,
  testID,
}: {
  tone: keyof typeof PILL_TONE;
  glyph: ReactNode;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint: string;
  accessibilityValue?: { text: string };
  testID: string;
}) {
  return (
    // A 44 pt target (docs/ACCESSIBILITY.md) around a pill drawn smaller, so
    // the control stays one line of the header rather than a card.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      {...(accessibilityValue ? { accessibilityValue } : {})}
      onPress={onPress}
      hitSlop={4}
      style={{ minHeight: 44, justifyContent: "center" }}
      testID={testID}
    >
      <View
        className={`flex-row items-center gap-1.5 rounded-full border-2 px-3 py-1.5 ${PILL_TONE[tone]}`}
      >
        {glyph}
        <Text className={`font-body-bold text-sm ${PILL_TEXT[tone]}`} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * The header line of the unit screen with the offline pill at its end.
 * `children` is whatever else the line says (the crown count, "Offline
 * copy"); it takes the room the pill does not.
 */
export function UnitDownload({
  unit,
  lang,
  children,
}: {
  unit: UnitResponse;
  lang: string;
  children?: ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const { plan } = usePlus();
  const downloads = useDownloads();
  const slug = unit.unit.slug;
  const state = offlineStateOf(downloads, downloadKey(slug, lang), plan);
  const [open, setOpen] = useState(false);
  const estimate = useMemo(() => estimateBytes(audioRefsOf(unit)), [unit]);

  // Nothing to show in the detail once only Plus is on offer (a removal on
  // the free plan): close it, so it does not spring open again later.
  const hasDetail = state.kind !== "plus";
  useEffect(() => {
    if (!hasDetail) setOpen(false);
  }, [hasDetail]);

  const show = () => {
    void haptic.light();
    setOpen(true);
  };
  const close = () => setOpen(false);

  let pill: ReactNode;
  switch (state.kind) {
    case "plus":
      pill = (
        <Pill
          tone="plus"
          glyph={<DownloadGlyph color={colors.sunText} />}
          label={t("units.download.pillPlus")}
          accessibilityLabel={t("units.download.pillPlusLabel")}
          accessibilityHint={t("units.download.plusOnly")}
          testID={`download-plus-${slug}`}
          onPress={() => {
            void haptic.light();
            router.push("/plus");
          }}
        />
      );
      break;
    case "idle":
      pill = state.failure ? (
        <Pill
          tone="failed"
          glyph={<DownloadGlyph color={colors.coralDeep} />}
          label={t("units.download.failedShort")}
          accessibilityLabel={t("units.download.failedShort")}
          accessibilityHint={t(ERROR_KEY[state.failure])}
          testID={`download-open-${slug}`}
          onPress={show}
        />
      ) : (
        <Pill
          tone="idle"
          glyph={<DownloadGlyph color={colors.seaDeep} />}
          label={t("units.download.start")}
          accessibilityLabel={t("units.download.start")}
          accessibilityHint={t("units.download.size", { size: formatBytes(estimate) })}
          testID={`download-open-${slug}`}
          onPress={show}
        />
      );
      break;
    case "active":
      pill = (
        <Pill
          tone="active"
          glyph={<MiniRing percent={state.percent} />}
          label={t("units.download.percent", { percent: state.percent })}
          accessibilityLabel={t("units.download.working")}
          accessibilityHint={t("units.download.progressHint")}
          accessibilityValue={{
            text: t("units.download.progress", {
              done: state.progress.done,
              total: state.progress.total,
            }),
          }}
          testID={`download-progress-${slug}`}
          onPress={show}
        />
      );
      break;
    case "ready":
      pill = (
        <Pill
          tone="ready"
          glyph={<CheckGlyph color={colors.seaDeep} />}
          label={t("units.download.ready")}
          accessibilityLabel={t("units.download.ready")}
          accessibilityHint={t("units.download.readyHint", { size: formatBytes(state.bytes) })}
          testID={`download-ready-${slug}`}
          onPress={show}
        />
      );
      break;
  }

  const detail =
    open && hasDetail ? (
      <Detail
        state={state}
        estimate={estimate}
        slug={slug}
        onStart={() => {
          void haptic.light();
          void startDownload(slug, lang);
        }}
        onCancel={() => cancelDownload(slug, lang)}
        onRemove={() => {
          void haptic.light();
          setOpen(false);
          void deleteDownload(slug, lang);
        }}
        onClose={close}
      />
    ) : null;

  return (
    <View>
      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-0.5">{children}</View>
        {pill}
      </View>
      {nativeUiAvailable() ? (
        <Sheet visible={open && hasDetail} onDismiss={close} testID={`download-sheet-${slug}`}>
          <View className="items-center">{detail}</View>
        </Sheet>
      ) : (
        detail && (
          <Card tone="cloud" className="mt-2 items-center" index={0}>
            {detail}
          </Card>
        )
      )}
    </View>
  );
}

/** The sheet's content: the same words the old card had, one state at a time. */
function Detail({
  state,
  estimate,
  slug,
  onStart,
  onCancel,
  onRemove,
  onClose,
}: {
  state: Exclude<OfflineState, { kind: "plus" }>;
  estimate: number;
  slug: string;
  onStart: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const closeButton = (
    <Button
      label={t("common.close")}
      variant="cloud"
      full
      testID={`download-close-${slug}`}
      onPress={onClose}
    />
  );

  if (state.kind === "ready") {
    return (
      <View className="w-full items-center gap-2">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-sea-soft">
          <CheckGlyph color={colors.seaDeep} size={28} />
        </View>
        <Text className="text-center font-display text-2xl text-indigo">
          {t("units.download.ready")}
        </Text>
        <Text className="text-center font-body text-base text-mist">
          {t("units.download.readyHint", { size: formatBytes(state.bytes) })}
        </Text>
        <View className="mt-3 w-full gap-3">
          <Button
            label={t("units.download.remove")}
            variant="ghost"
            full
            testID={`download-remove-${slug}`}
            onPress={onRemove}
          />
          {closeButton}
        </View>
      </View>
    );
  }

  if (state.kind === "active") {
    const { done, total, bytes } = state.progress;
    return (
      <View className="w-full items-center gap-2">
        <Text className="text-center font-display text-2xl text-indigo">
          {t("units.download.working")}
        </Text>
        <View
          className="mt-1 h-2 w-full overflow-hidden rounded-full bg-sand-deep"
          accessibilityRole="progressbar"
          accessibilityLabel={t("units.download.working")}
          accessibilityValue={{ min: 0, max: 100, now: state.percent }}
        >
          <View className="h-full rounded-full bg-sea" style={{ width: `${state.percent}%` }} />
        </View>
        <Text className="text-center font-body text-base text-mist">
          {t("units.download.progress", { done, total })} · {formatBytes(bytes)}
        </Text>
        <View className="mt-3 w-full gap-3">
          <Button
            label={t("common.cancel")}
            variant="ghost"
            full
            testID={`download-cancel-${slug}`}
            onPress={onCancel}
          />
          {closeButton}
        </View>
      </View>
    );
  }

  return (
    <View className="w-full items-center gap-2">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-sea-soft">
        <DownloadGlyph color={colors.seaDeep} size={28} />
      </View>
      <Text className="text-center font-display text-2xl text-indigo">
        {t("units.download.title")}
      </Text>
      <Text className="text-center font-body text-base text-mist">{t("units.download.hint")}</Text>
      {state.failure ? (
        <Text className="text-center font-body-semibold text-base text-coral-deep">
          {t(ERROR_KEY[state.failure])}
        </Text>
      ) : (
        <Text className="text-center font-body-semibold text-base text-ink">
          {t("units.download.size", { size: formatBytes(estimate) })}
        </Text>
      )}
      <View className="mt-3 w-full gap-3">
        <Button
          label={state.failure ? t("common.retry") : t("units.download.start")}
          variant="sea"
          size="lg"
          full
          testID={`download-start-${slug}`}
          onPress={onStart}
        />
        {closeButton}
      </View>
    </View>
  );
}
