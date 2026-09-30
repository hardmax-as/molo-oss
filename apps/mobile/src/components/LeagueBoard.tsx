import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Alert, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import {
  hideLeagueMember,
  reportLeagueMember,
  showLeagueMember,
  type LeagueHistoryResponse,
  type LeagueResponse,
  type LeagueTier,
} from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import { daysLeft, zoneOf } from "~/lib/leagues.ts";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { haptic } from "~/ui/haptics.ts";
import { Crane } from "~/ui/Mascots.tsx";
import { useMotion } from "~/ui/motion.ts";
import { colors } from "~/ui/theme.ts";
import { useToast } from "~/ui/Toast.tsx";

type Row = LeagueResponse["standings"][number];

/**
 * Report and hide for another learner's name (Apple guideline 1.2). A plain
 * alert keeps it native and needs no new component: Report asks once more
 * before sending, Hide and Show act at once. Every outcome is a toast.
 */
function useRowActions() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => qc.invalidateQueries({ queryKey: ["league"] });
  const fail = () => toast.show(t("leagues.actionFailed"), "coral");
  const report = useMutation({
    mutationFn: reportLeagueMember,
    onSuccess: async () => {
      toast.show(t("leagues.reported"));
      await refresh();
    },
    onError: fail,
  });
  const hide = useMutation({ mutationFn: hideLeagueMember, onSuccess: refresh, onError: fail });
  const show = useMutation({ mutationFn: showLeagueMember, onSuccess: refresh, onError: fail });
  return (row: Row, label: string) => {
    void haptic.tap();
    Alert.alert(label, undefined, [
      {
        text: t("leagues.report"),
        style: "destructive",
        onPress: () =>
          Alert.alert(t("leagues.reportTitle"), t("leagues.reportBody"), [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("leagues.report"),
              style: "destructive",
              onPress: () => report.mutate(row.userId),
            },
          ]),
      },
      row.hidden
        ? { text: t("leagues.show"), onPress: () => show.mutate(row.userId) }
        : { text: t("leagues.hide"), onPress: () => hide.mutate(row.userId) },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };
}

const tierColor: Record<LeagueTier, string> = {
  bronze: colors.ochre,
  silver: colors.mistSoft,
  gold: colors.sun,
  sapphire: colors.sea,
  ruby: colors.coral,
};

/**
 * The weekly league, drawn from the payload alone: the tier header with the
 * learner's own rank, the standings with their promotion and demotion
 * stripes, and the weeks behind them. The screen fetches and guards; this
 * only paints, so an empty cohort and a full one can both be looked at
 * without waiting a week for one.
 */
export function LeagueBoard({
  data,
  history,
}: {
  data: LeagueResponse;
  history?: LeagueHistoryResponse | undefined;
}) {
  const t = useT();
  const m = useMotion();
  const router = useRouter();
  const openActions = useRowActions();

  if (!data.league) {
    return (
      <Card>
        <View className="items-center gap-3">
          <Crane pose="think" size={130} />
          <Text className="text-center font-display text-xl text-indigo">
            {t("leagues.notJoined")}
          </Text>
          <Text className="text-center font-body text-sm text-mist">
            {t("leagues.rules", {
              promote: data.rules.promote,
              demote: data.rules.demote,
              size: data.rules.size,
            })}
          </Text>
          <View className="mt-2">
            <Button
              label={t("review.emptyCta")}
              variant="sun"
              onPress={() => router.navigate("/")}
            />
          </View>
        </View>
      </Card>
    );
  }

  const tier = data.league.tier;
  const size = Math.max(data.standings.length, data.rules.size);

  return (
    <>
      <Card tone="indigo" index={0}>
        <View className="flex-row items-center gap-4">
          <View
            accessibilityLabel={t(`leagues.tier.${tier}`)}
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: tierColor[tier],
              transform: [{ rotate: "45deg" }],
            }}
          />
          <View className="flex-1">
            <Text className="font-display-bold text-3xl text-cloud">
              {t(`leagues.tier.${tier}`)}
            </Text>
            <Text className="font-body text-sm text-cloud/80">
              {t("leagues.week", { date: data.league.weekStart })} ·{" "}
              {t("leagues.daysLeft", { count: daysLeft(data.league.weekEnd) })}
            </Text>
          </View>
        </View>
        {data.me && (
          <View className="mt-4 flex-row items-center gap-3 rounded-2xl bg-cloud/10 p-3">
            <Text className="font-display-bold text-2xl text-sun">
              {t("leagues.rank", { rank: data.me.rank })}
            </Text>
            <Text className="font-body-semibold text-base text-cloud">{data.me.xp} XP</Text>
            <View className="flex-1" />
            <Text className="font-body-bold text-xs text-cloud">
              {t(`leagues.${data.me.zone}`)}
            </Text>
          </View>
        )}
        <Text className="mt-3 font-body text-xs text-cloud/70">
          {t("leagues.rules", {
            promote: data.rules.promote,
            demote: data.rules.demote,
            size: data.rules.size,
          })}
        </Text>
      </Card>

      <View className="gap-2">
        {data.standings.length === 0 && (
          <Text className="font-body text-mist">{t("leagues.empty")}</Text>
        )}
        {data.standings.map((row, i) => {
          const zone = zoneOf(row.rank, size, data.rules.promote, data.rules.demote);
          const stripe =
            zone === "promote" ? colors.sea : zone === "demote" ? colors.coral : colors.cloudDeep;
          const name = row.isMe
            ? t("leagues.you")
            : (row.name ?? (row.hidden ? t("leagues.hiddenName") : t("leagues.anonymous")));
          return (
            <Animated.View
              key={row.userId}
              entering={FadeInDown.duration(m.enter).delay(i * m.stagger)}
              className={`min-h-12 flex-row items-center gap-3 rounded-2xl px-4 py-3 ${row.isMe ? "bg-sun" : "bg-cloud"}`}
              style={{ borderLeftWidth: 5, borderLeftColor: stripe }}
              accessible
              accessibilityLabel={`${t("leagues.rank", { rank: row.rank })} ${name}, ${row.xp} XP, ${t(`leagues.${zone}`)}`}
              testID={row.isMe ? "league-me" : undefined}
              // The row is one accessible element, so the options button inside
              // it is offered to VoiceOver and TalkBack as a custom action.
              {...(row.isMe
                ? {}
                : {
                    accessibilityActions: [
                      { name: "options", label: t("leagues.actions", { name }) },
                    ],
                    onAccessibilityAction: () => openActions(row, name),
                  })}
            >
              <Text className="w-8 font-display-bold text-lg text-ink">{row.rank}</Text>
              <Text className="flex-1 font-body-semibold text-base text-ink" numberOfLines={1}>
                {name}
              </Text>
              <Text className="font-display text-base text-ink">{row.xp} XP</Text>
              {!row.isMe && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("leagues.actions", { name })}
                  onPress={() => openActions(row, name)}
                  hitSlop={8}
                  className="-mr-2 h-11 w-9 items-center justify-center"
                  testID={`league-actions-${row.rank}`}
                >
                  <Text className="font-display-bold text-lg text-mist">⋯</Text>
                </Pressable>
              )}
            </Animated.View>
          );
        })}
      </View>

      {history && history.weeks.length > 0 && (
        <Card index={2}>
          <Text className="mb-2 font-display text-lg text-indigo">{t("leagues.history")}</Text>
          {history.weeks.map((w) => (
            <View key={w.weekStart} className="flex-row items-center gap-3 py-1">
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: tierColor[w.tier],
                }}
              />
              <Text className="flex-1 font-body text-sm text-ink">
                {w.weekStart} · {t(`leagues.tier.${w.tier}`)} ·{" "}
                {t("leagues.rank", { rank: w.rank })}
              </Text>
              <Text className="font-body-bold text-xs text-mist">
                {t(`leagues.outcome.${w.outcome}`)}
              </Text>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}
