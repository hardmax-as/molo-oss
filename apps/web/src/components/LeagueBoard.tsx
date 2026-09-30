import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Eye, EyeOff, Flag, Minus, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";

import { Card } from "~/components/ui/Card.tsx";
import {
  hideLeagueMember,
  reportLeagueMember,
  showLeagueMember,
  type LeagueHistoryResponse,
  type LeagueResponse,
  type LeagueTier,
} from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import { listVariants, riseVariants, useMotionPrefs } from "~/lib/motion.ts";

/**
 * Report and hide for another learner's name (Apple guideline 1.2, kept in
 * step with the app). Report asks once before sending and hides the name for
 * the reporter; hide and show act at once.
 */
function RowActions({ row, name }: { row: LeagueResponse["standings"][number]; name: string }) {
  const t = useT();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["league"] });
  const fail = () => toast.error(t("leagues.actionFailed"));
  const report = useMutation({
    mutationFn: () => reportLeagueMember(row.userId),
    onSuccess: async () => {
      toast.success(t("leagues.reported"));
      await refresh();
    },
    onError: fail,
  });
  const toggle = useMutation({
    mutationFn: () => (row.hidden ? showLeagueMember(row.userId) : hideLeagueMember(row.userId)),
    onSuccess: refresh,
    onError: fail,
  });
  const icon =
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-mist hover:bg-sand-deep hover:text-indigo disabled:opacity-50";
  return (
    <span
      className="flex shrink-0 items-center"
      role="group"
      aria-label={t("leagues.actions", { name })}
    >
      <button
        type="button"
        className={icon}
        disabled={toggle.isPending}
        onClick={() => toggle.mutate()}
        aria-label={row.hidden ? t("leagues.show") : t("leagues.hide")}
        title={row.hidden ? t("leagues.show") : t("leagues.hide")}
      >
        {row.hidden ? <Eye size={18} aria-hidden /> : <EyeOff size={18} aria-hidden />}
      </button>
      <button
        type="button"
        className={icon}
        disabled={report.isPending}
        onClick={() => {
          if (window.confirm(`${t("leagues.reportTitle")}\n\n${t("leagues.reportBody")}`))
            report.mutate();
        }}
        aria-label={t("leagues.report")}
        title={t("leagues.report")}
      >
        <Flag size={18} aria-hidden />
      </button>
    </span>
  );
}

/** Tier looks: a gradient and a glyph colour per tier, from the palette. */
const TIERS: Record<LeagueTier, { bg: string; glyph: string }> = {
  bronze: { bg: "from-ochre to-ochre-deep", glyph: "text-sun-soft" },
  silver: { bg: "from-mist to-indigo-soft", glyph: "text-cloud" },
  gold: { bg: "from-sun to-ochre", glyph: "text-indigo" },
  sapphire: { bg: "from-sea to-indigo", glyph: "text-sun" },
  ruby: { bg: "from-coral to-indigo-deep", glyph: "text-sun" },
};

function daysLeft(weekEnd: string): number {
  const end = new Date(`${weekEnd}T00:00:00Z`).getTime();
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

/**
 * The weekly league, drawn from the payload alone: the tier header with the
 * learner's own rank, the standings with their promotion and demotion zones,
 * and the weeks behind them. The route fetches and guards; this only paints,
 * so an empty cohort and a full one can both be looked at without waiting a
 * week for one.
 */
export function LeagueBoard({
  data,
  history,
}: {
  data: LeagueResponse;
  history?: LeagueHistoryResponse | undefined;
}) {
  const t = useT();
  const { reduced } = useMotionPrefs();
  const { league: current, standings, me: mine, rules } = data;

  return (
    <section className="mx-auto max-w-2xl">
      {current ? (
        <header
          className={`relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white shadow-pop ${TIERS[current.tier].bg}`}
        >
          <Trophy
            size={120}
            className={`absolute -right-6 -top-6 opacity-20 ${TIERS[current.tier].glyph}`}
            aria-hidden
          />
          <p className="text-xs font-bold uppercase tracking-widest opacity-80">
            {t("leagues.title")}
          </p>
          <h1 className="mt-1 font-display text-4xl font-bold">
            {t(`leagues.tier.${current.tier}` as never)}
          </h1>
          <p className="mt-2 text-sm opacity-90">
            {t("leagues.week", { date: current.weekStart })} ·{" "}
            {t("leagues.daysLeft", { count: daysLeft(current.weekEnd) })}
          </p>
          {mine && (
            <div className="mt-4 inline-flex items-center gap-3 rounded-2xl bg-white/15 px-4 py-2 backdrop-blur">
              <span className="font-display text-3xl font-bold">
                {t("leagues.rank", { rank: mine.rank })}
              </span>
              <span className="font-semibold">{mine.xp} XP</span>
              <Zone zone={mine.zone} />
            </div>
          )}
        </header>
      ) : (
        <Card tone="sun" className="mb-6 text-center">
          <Trophy size={40} className="mx-auto mb-2 text-ochre-deep" aria-hidden />
          <h1 className="font-display text-2xl font-bold text-indigo">{t("leagues.title")}</h1>
          <p className="mt-1 text-indigo/80">{t("leagues.empty")}</p>
        </Card>
      )}

      {standings.length > 0 && (
        <motion.ol variants={listVariants} initial="hidden" animate="show" className="space-y-2">
          {standings.map((row, i) => {
            // Demotion never reaches into the promotion zone, whatever the cohort size.
            const demoteFrom = Math.max(rules.promote + 1, standings.length - rules.demote + 1);
            const zone =
              row.rank <= rules.promote ? "promote" : row.rank >= demoteFrom ? "demote" : "stay";
            const label =
              i === rules.promote && i < standings.length
                ? demoteFrom === rules.promote + 1
                  ? "demote"
                  : "stay"
                : i === demoteFrom - 1 && i > rules.promote
                  ? "demote"
                  : null;
            return (
              <motion.li key={row.userId} variants={riseVariants(reduced)} custom={i}>
                {label && (
                  <p
                    className={`mb-2 mt-3 text-center text-xs font-bold uppercase tracking-widest ${label === "stay" ? "text-sea-deep" : "text-coral-deep"}`}
                  >
                    {t(`leagues.${label}` as never)}
                  </p>
                )}
                {i === 0 && (
                  <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-sea-deep">
                    {t("leagues.promote")}
                  </p>
                )}
                <div
                  className={`flex items-center gap-4 rounded-2xl px-4 py-3 ${row.isMe ? "bg-indigo text-white shadow-pop" : "bg-cloud text-ink shadow-card"}`}
                >
                  <span
                    className={`w-8 text-center font-display text-xl font-bold ${row.isMe ? "text-sun" : zone === "promote" ? "text-sea-deep" : zone === "demote" ? "text-coral-deep" : "text-mist"}`}
                  >
                    {row.rank}
                  </span>
                  <span className="grow truncate font-semibold">
                    {row.isMe
                      ? t("leagues.you")
                      : (row.name ??
                        (row.hidden ? t("leagues.hiddenName") : t("leagues.anonymous")))}
                  </span>
                  <span className="font-display font-bold">{row.xp} XP</span>
                  {!row.isMe && (
                    <RowActions
                      row={row}
                      name={
                        row.name ?? (row.hidden ? t("leagues.hiddenName") : t("leagues.anonymous"))
                      }
                    />
                  )}
                </div>
              </motion.li>
            );
          })}
        </motion.ol>
      )}

      <p className="mt-6 text-center text-sm text-mist">
        {t("leagues.rules", { promote: rules.promote, demote: rules.demote, size: rules.size })}
      </p>

      {history && history.weeks.length > 0 && (
        <Card index={2} className="mt-8">
          <h2 className="mb-3 font-display text-xl font-bold text-indigo">
            {t("leagues.history")}
          </h2>
          <ul className="divide-y divide-mist-soft">
            {history.weeks.map((w) => (
              <li key={w.weekStart} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-24 text-mist">{w.weekStart}</span>
                <span className="grow font-semibold">{t(`leagues.tier.${w.tier}` as never)}</span>
                <span className="text-mist">{t("leagues.rank", { rank: w.rank })}</span>
                <span className="w-16 text-right font-display font-bold">{w.xp} XP</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${w.outcome === "promoted" ? "bg-sea-soft text-sea-deep" : w.outcome === "demoted" ? "bg-coral-soft text-coral-deep" : "bg-sand-deep text-indigo"}`}
                >
                  {t(`leagues.outcome.${w.outcome}` as never)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function Zone({ zone }: { zone: "promote" | "stay" | "demote" }) {
  const t = useT();
  const Icon = zone === "promote" ? ArrowUp : zone === "demote" ? ArrowDown : Minus;
  const tone =
    zone === "promote"
      ? "bg-sea-deep text-white"
      : zone === "demote"
        ? "bg-coral-deep text-white"
        : "bg-white/30 text-white";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}
    >
      <Icon size={12} aria-hidden /> {t(`leagues.${zone}` as never)}
    </span>
  );
}
