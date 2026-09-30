import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { LeagueBoard } from "~/components/LeagueBoard.tsx";
import { SaveProgressWall } from "~/components/SaveProgressWall.tsx";
import { ApiError, getLeague, getLeagueHistory, type LeagueResponse } from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";
import { useGuest } from "~/lib/use-guest.tsx";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { Crane } from "~/ui/Mascots.tsx";
import { Screen } from "~/ui/Screen.tsx";
import { LeagueSkeleton } from "~/ui/Skeleton.tsx";

/** __DEV__ fixture so the screen can be designed before the API lands. Never shipped. */
function devFixture(meId: string): LeagueResponse {
  const names = [
    "Anele",
    "Thandi",
    "Sipho",
    "Nomvula",
    "Lwazi",
    "Buhle",
    "Zola",
    "Vuyo",
    "Aya",
    "Kai",
  ];
  const standings = names.map((name, i) => ({
    userId: i === 4 ? meId : `zz-${i}`,
    name: i === 4 ? "You" : name,
    hidden: false,
    xp: 320 - i * 27,
    rank: i + 1,
    isMe: i === 4,
  }));
  return {
    league: { id: "zz", tier: "silver", weekStart: "2026-08-31", weekEnd: "2026-09-06", size: 20 },
    standings,
    me: { rank: 5, xp: 212, zone: "promote" },
    rules: { size: 20, promote: 5, demote: 5 },
  };
}

export default function LeaguesScreen() {
  const t = useT();
  const router = useRouter();
  const me = useMe();
  const guest = useGuest();
  const league = useQuery({
    queryKey: ["league"],
    enabled: !!me.data,
    queryFn: async () => {
      try {
        return await getLeague();
      } catch (e) {
        if (__DEV__ && e instanceof ApiError && e.status === 404)
          return devFixture(me.data?.user.id ?? "");
        throw e;
      }
    },
  });
  const history = useQuery({
    queryKey: ["league-history"],
    enabled: !!me.data,
    queryFn: async () => {
      try {
        return await getLeagueHistory();
      } catch (e) {
        if (__DEV__ && e instanceof ApiError && e.status === 404) return { weeks: [] };
        throw e;
      }
    },
  });

  if (me.isPending || (me.data && league.isPending)) return <LeagueSkeleton />;
  if (!me.data) {
    if (guest.walled)
      return (
        <Screen>
          <SaveProgressWall xp={guest.xp} lessons={guest.lessons} />
        </Screen>
      );
    return (
      <Screen>
        <Card tone="indigo">
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 font-display text-lg text-cloud">
              {t("leagues.signInFirst")}
            </Text>
            <Crane pose="hello" size={96} surface="dark" />
          </View>
          <View className="mt-4 items-start">
            <Button label={t("nav.signIn")} variant="sun" onPress={() => router.push("/auth")} />
          </View>
        </Card>
      </Screen>
    );
  }
  if (me.data.leagueProfile?.leaguesOptOut)
    return (
      <Screen>
        <Card>
          <Text className="mb-3 font-body text-mist">{t("leagueSettings.disabled")}</Text>
          <Button
            label={t("settings.title")}
            variant="sea"
            onPress={() => router.push("/settings")}
          />
        </Card>
      </Screen>
    );
  if (league.isError || !league.data)
    return (
      <Screen>
        <Text className="font-body-semibold text-coral-deep">{t("common.error")}</Text>
      </Screen>
    );

  return (
    <Screen>
      <LeagueBoard data={league.data} history={history.data} />
    </Screen>
  );
}
