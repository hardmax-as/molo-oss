import { currentNodeKey, pathLinks, type GuideSpeech } from "@molo/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SectionList, Text, View } from "react-native";

import { ChestNode, LessonNode, PathStop, UnitBanner } from "~/components/path/PathNodes.tsx";
import { ProgressStrip } from "~/components/ProgressStrip.tsx";
import { UnitDownload } from "~/components/UnitDownload.tsx";
import { useFakeState, useTuning } from "~/dev/knobs.tsx";
import { DEMO_UNIT_SLUG } from "~/fixtures/demo-unit.ts";
import { getCrown, localToday } from "~/lib/api.ts";
import { warmLesson, warmUnitWhenUnmetered } from "~/lib/audio-cache.ts";
import { useContentTitle, useLang, useT } from "~/lib/i18n.tsx";
import { resolveSpeech } from "~/lib/path-guide.ts";
import { pathSections, unitPathRows, type PathNodeRow } from "~/lib/path-model.ts";
import { useMe } from "~/lib/session.tsx";
import { useUnitLocks } from "~/lib/use-locks.ts";
import { PATH_KEY, usePathState } from "~/lib/use-path.ts";
import { useUnit } from "~/lib/use-unit.ts";
import { useUnitList } from "~/lib/use-units.ts";
import { haptic } from "~/ui/haptics.ts";
import { useSfx } from "~/ui/sfx.tsx";
import { UnitSkeleton } from "~/ui/Skeleton.tsx";

/**
 * A unit's stretch of path: typed lesson nodes winding down the screen, a
 * chest at the end of every skill, the crane standing beside the node the
 * learner is being pointed at, and a section header that stays put while
 * the stretch scrolls. The list is a `SectionList`, so a long unit is
 * windowed rather than mounted whole. The nodes themselves live in
 * `~/components/path/PathNodes.tsx`.
 */
export default function UnitScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useT();
  const title = useContentTitle();
  const { lang } = useLang();
  const router = useRouter();
  const me = useMe();
  const sfx = useSfx();
  const qc = useQueryClient();
  const unit = useUnit(slug ?? "");
  const units = useUnitList();
  const locks = useUnitLocks(units.data?.units ?? []);
  const tuning = useTuning();
  // A fabricated "unit finished" (the knobs panel) crowns every lesson of
  // one unit and unlocks it, so the crown and the chest can be seen without
  // playing the unit. Display only: the server still holds no crowns.
  const fakeFinished = useFakeState().finishedUnitSlug === slug;
  const unitLocked = fakeFinished
    ? false
    : unit.data
      ? locks.lockOf({ id: unit.data.unit.id }).locked
      : false;
  const real = usePathState(unitLocked);
  const path = fakeFinished
    ? {
        ...real,
        state: { ...real.state, crownOf: (id: string) => Math.max(1, real.state.crownOf(id)) },
      }
    : real;
  const crown = useQuery({
    queryKey: ["crown", slug],
    queryFn: () => getCrown(slug ?? ""),
    enabled: !!me.data && !!slug && slug !== DEMO_UNIT_SLUG,
  });
  const [speech, setSpeech] = useState<GuideSpeech>(null);
  useEffect(() => {
    void resolveSpeech(localToday()).then(setSpeech);
  }, []);
  const crownedBefore = useRef<boolean | null>(null);
  useEffect(() => {
    if (!crown.data) return;
    if (crownedBefore.current === false && crown.data.crowned) {
      sfx.play("crown");
      void haptic.success();
    }
    crownedBefore.current = crown.data.crowned;
  }, [crown.data, sfx]);

  const rows = useMemo(
    () => (unit.data ? unitPathRows(unit.data.unit, path.state, tuning.xp.skillChest) : []),
    [unit.data, path.state, tuning.xp.skillChest],
  );
  const sections = useMemo(() => pathSections(rows), [rows]);
  const links = useMemo(() => pathLinks(rows), [rows]);
  const here = currentNodeKey(rows);
  const hereLessonId =
    rows.find(
      (r): r is Extract<PathNodeRow, { type: "lesson" }> => r.type === "lesson" && r.key === here,
    )?.lessonId ?? null;

  // Back on this screen after a lesson (a swipe back keeps it mounted):
  // whatever the lesson made stale — crowns, badges — is fetched again
  // behind the copy on screen. The first focus is the mount, which fetches
  // by itself.
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedBefore.current) {
        focusedBefore.current = true;
        return;
      }
      const stale = { type: "active", stale: true } as const;
      void qc.refetchQueries({ queryKey: PATH_KEY, ...stale }, { cancelRefetch: false });
      void qc.refetchQueries(
        { queryKey: ["unit", slug, lang], ...stale },
        { cancelRefetch: false },
      );
    }, [qc, slug, lang]),
  );

  // The clips of the lesson the crane points at, fetched ahead so its first
  // exercises play at once; on Wi-Fi the rest of the unit follows behind
  // (src/lib/audio-cache.ts). Only from the network's copy: a placeholder may
  // be yesterday's.
  const loaded = unit.data && !unit.isPlaceholderData && !unitLocked ? unit.data : null;
  useEffect(() => {
    if (!loaded || slug === DEMO_UNIT_SLUG) return undefined;
    const timer = setTimeout(() => {
      if (hereLessonId) warmLesson(loaded, hereLessonId);
      warmUnitWhenUnmetered(loaded);
    }, 400);
    return () => clearTimeout(timer);
  }, [loaded, hereLessonId, slug]);

  if (unit.isPending)
    return (
      <>
        <Stack.Screen options={{ headerLargeTitle: false, title: "" }} />
        <UnitSkeleton />
      </>
    );
  if (unit.isError || !unit.data)
    return (
      <View className="flex-1 bg-sand p-5">
        <Stack.Screen options={{ headerLargeTitle: false, title: "" }} />
        <Text className="font-body-semibold text-coral-deep">{t("common.error")}</Text>
      </View>
    );
  const content = unit.data;
  const u = content.unit;
  // The header's one line: the crown count and "Offline copy" on the left,
  // the offline pill at its end, where a card used to take a third of the screen.
  const captions = (
    <>
      {crown.data && crown.data.total > 0 && (
        <Text className="font-body-semibold text-sm text-ink">
          {crown.data.crowned
            ? t("units.crowned")
            : t("units.crown", { mature: crown.data.mature, total: crown.data.total })}
        </Text>
      )}
      {content.offline && (
        <Text className="font-body-semibold text-xs text-mist">{t("units.offline")}</Text>
      )}
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: title(u.titleKey, u.slug), headerLargeTitle: false }} />
      <SectionList
        className="flex-1 bg-sand"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="px-5 pb-16"
        sections={sections}
        keyExtractor={(row: PathNodeRow) => row.key}
        stickySectionHeadersEnabled
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View className="gap-3 pb-2">
            <ProgressStrip compact />
            {slug !== DEMO_UNIT_SLUG ? (
              <UnitDownload unit={content} lang={lang}>
                {captions}
              </UnitDownload>
            ) : (
              captions
            )}
          </View>
        }
        renderSectionHeader={({ section }) => <UnitBanner row={section.unit} />}
        renderItem={({ item }) => {
          if (item.type === "skill")
            return (
              <View className="flex-row items-center justify-center py-4">
                <Text className="font-display text-base text-mist">
                  {title(item.titleKey, item.skillId)}
                </Text>
              </View>
            );
          return (
            <PathStop
              row={item}
              links={links.get(item.key)}
              guide={here === item.key ? speech : undefined}
            >
              {item.type === "lesson" ? (
                <LessonNode
                  row={item}
                  onPress={() => {
                    // Its first clips go ahead of anything else being warmed.
                    if (slug !== DEMO_UNIT_SLUG) warmLesson(content, item.lessonId);
                    router.push({
                      pathname: "/learn/[slug]/[lessonId]",
                      params: { slug: u.slug, lessonId: item.lessonId },
                    });
                  }}
                />
              ) : (
                <ChestNode
                  row={item}
                  busy={path.claiming === item.skillId}
                  onClaim={() => {
                    void haptic.success();
                    sfx.play("crown");
                    path.claim(item.skillId);
                  }}
                />
              )}
            </PathStop>
          );
        }}
      />
    </>
  );
}
