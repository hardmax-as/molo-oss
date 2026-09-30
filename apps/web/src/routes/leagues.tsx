import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Trophy } from "lucide-react";

import { Crane } from "~/components/illustrations/Crane.tsx";
import { LeagueBoard } from "~/components/LeagueBoard.tsx";
import { SaveProgressWall } from "~/components/SaveProgressWall.tsx";
import { ButtonLink } from "~/components/ui/Button.tsx";
import { Card } from "~/components/ui/Card.tsx";
import { LeagueSkeleton } from "~/components/ui/Skeleton.tsx";
import { getLeague, getLeagueHistory } from "~/lib/api.ts";
import { guestXp, readGuest } from "~/lib/guest.ts";
import { useT } from "~/lib/i18n.tsx";
import { preloadLeagues } from "~/lib/prefetch.ts";
import { NOINDEX } from "~/lib/seo.ts";
import { useMe } from "~/lib/session.tsx";

export const Route = createFileRoute("/leagues")({
  head: () => ({ meta: [NOINDEX] }),
  loader: ({ context }) => preloadLeagues(context.queryClient),
  component: LeaguesPage,
});

/** Weekly leagues: your cohort's standings with promotion and demotion zones, and your past weeks. */
function LeaguesPage() {
  const t = useT();
  const me = useMe();
  const league = useQuery({
    queryKey: ["league"],
    queryFn: getLeague,
    enabled: !!me.data,
    staleTime: 60_000,
  });
  const history = useQuery({
    queryKey: ["league-history"],
    queryFn: getLeagueHistory,
    enabled: !!me.data,
    staleTime: 60_000,
  });

  if (me.isSuccess && !me.data) {
    const g = readGuest();
    return <SaveProgressWall xp={guestXp(g)} lessons={g.lessons.length} />;
  }
  if (me.isPending) return <LeagueSkeleton />;
  if (!me.data)
    return (
      <Card className="mx-auto max-w-md text-center">
        <div className="mb-2 flex justify-center">
          <Crane pose="think" size={120} />
        </div>
        <Trophy size={40} className="mx-auto mb-3 text-sun" aria-hidden />
        <h1 className="mb-2 font-display text-2xl font-bold text-indigo">{t("leagues.title")}</h1>
        <p className="mb-4 text-mist">{t("leagues.signInFirst")}</p>
        <ButtonLink to="/auth" variant="indigo">
          {t("nav.signIn")}
        </ButtonLink>
      </Card>
    );
  if (me.data.leagueProfile?.leaguesOptOut)
    return (
      <Card className="mx-auto max-w-md space-y-4">
        <h1 className="font-display text-2xl font-bold text-indigo">{t("leagues.title")}</h1>
        <p className="text-mist">{t("leagueSettings.disabled")}</p>
        <ButtonLink to="/settings" variant="indigo">
          {t("settings.title")}
        </ButtonLink>
      </Card>
    );
  if (league.isPending) return <LeagueSkeleton />;
  if (league.isError || !league.data) return <p className="text-coral-deep">{t("common.error")}</p>;

  return <LeagueBoard data={league.data} history={history.data} />;
}
