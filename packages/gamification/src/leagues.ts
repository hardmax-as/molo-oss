/**
 * Weekly leagues. Pure rules first, then the database adapters. A league is
 * one cohort of learners in one tier for one ISO week (Monday, UTC); XP
 * stays in `xp_events` and standings are derived from it, so this module
 * never stores a counter that could drift. Finalisation writes rank and
 * outcome once per member and is idempotent.
 */

import { leagueName, nameAllowed } from "@molo/core";
import { REPORTS_TO_HOLD_NAME, schema, type Db } from "@molo/db";
import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";

export const LEAGUE_TIERS = ["bronze", "silver", "gold", "sapphire", "ruby"] as const;
export type LeagueTier = (typeof LEAGUE_TIERS)[number];
export type LeagueOutcome = "promoted" | "stayed" | "demoted";

export interface LeagueRules {
  readonly size: number;
  readonly promote: number;
  readonly demote: number;
}
export const LEAGUE_RULES: LeagueRules = { size: 20, promote: 5, demote: 5 };

/** ISO date of the Monday (UTC) that starts the week containing `d`. */
export function weekStartOf(d: Date): string {
  const day = d.getUTCDay(); // 0 Sunday .. 6 Saturday
  const back = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
  return monday.toISOString().slice(0, 10);
}

/** Exclusive end: the next Monday. */
export function weekEndOf(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

export function nextTier(tier: LeagueTier, outcome: LeagueOutcome): LeagueTier {
  const i = LEAGUE_TIERS.indexOf(tier);
  if (outcome === "promoted") return LEAGUE_TIERS[Math.min(i + 1, LEAGUE_TIERS.length - 1)] ?? tier;
  if (outcome === "demoted") return LEAGUE_TIERS[Math.max(i - 1, 0)] ?? tier;
  return tier;
}

export interface Ranked {
  readonly userId: string;
  readonly xp: number;
}

/**
 * Ranks a cohort (input must already be sorted by xp desc, ties by join
 * time) and decides outcomes. The top `promote` go up unless the tier is
 * the last one, the bottom `demote` go down unless the tier is the first;
 * nobody with zero XP is promoted, and a cohort too small for both zones
 * keeps promotion over demotion.
 */
export function outcomesFor(
  sorted: readonly Ranked[],
  tier: LeagueTier,
  rules: LeagueRules = LEAGUE_RULES,
): ReadonlyArray<Ranked & { rank: number; outcome: LeagueOutcome }> {
  const n = sorted.length;
  const canPromote = tier !== LEAGUE_TIERS[LEAGUE_TIERS.length - 1];
  const canDemote = tier !== LEAGUE_TIERS[0];
  const promoteCount = Math.min(rules.promote, n);
  const demoteCount = Math.max(0, Math.min(rules.demote, n - promoteCount));
  return sorted.map((r, i) => {
    const rank = i + 1;
    let outcome: LeagueOutcome = "stayed";
    if (canPromote && i < promoteCount && r.xp > 0) outcome = "promoted";
    else if (canDemote && i >= n - demoteCount) outcome = "demoted";
    return { ...r, rank, outcome };
  });
}

/** The zone a rank falls in before the week ends, for the UI. */
export function zoneFor(
  rank: number,
  cohortSize: number,
  tier: LeagueTier,
  rules: LeagueRules = LEAGUE_RULES,
) {
  const canPromote = tier !== LEAGUE_TIERS[LEAGUE_TIERS.length - 1];
  const canDemote = tier !== LEAGUE_TIERS[0];
  if (canPromote && rank <= rules.promote) return "promote" as const;
  if (canDemote && rank > cohortSize - rules.demote && cohortSize > rules.promote)
    return "demote" as const;
  return "stay" as const;
}

// ---- database adapters -----------------------------------------------------

/** The learner's tier for a new week: what last week's outcome says, else bronze. */
async function tierFor(db: Db, userId: string): Promise<LeagueTier> {
  const [last] = await db
    .select({ tier: schema.leagues.tier, outcome: schema.leagueMembers.outcome })
    .from(schema.leagueMembers)
    .innerJoin(schema.leagues, eq(schema.leagues.id, schema.leagueMembers.leagueId))
    .where(eq(schema.leagueMembers.userId, userId))
    .orderBy(desc(schema.leagueMembers.weekStart))
    .limit(1);
  if (!last) return "bronze";
  return last.outcome ? nextTier(last.tier, last.outcome) : last.tier;
}

/**
 * Puts the learner into this week's league if they are not in one yet.
 * Called when XP is awarded, so a learner who never studies never appears
 * in a table. Returns null when the learner has opted out.
 */
export async function joinLeague(
  db: Db,
  userId: string,
  now = new Date(),
  rules = LEAGUE_RULES,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ optedOut: schema.users.leaguesOptOut })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .for("update");
    if (!user || user.optedOut) return null;
    return joinLeagueForParticipant(tx, userId, now, rules);
  });
}

async function joinLeagueForParticipant(
  db: Db,
  userId: string,
  now: Date,
  rules: LeagueRules,
): Promise<string> {
  const weekStart = weekStartOf(now);
  const [existing] = await db
    .select({ leagueId: schema.leagueMembers.leagueId })
    .from(schema.leagueMembers)
    .where(
      and(eq(schema.leagueMembers.userId, userId), eq(schema.leagueMembers.weekStart, weekStart)),
    )
    .limit(1);
  if (existing) return existing.leagueId;
  const tier = await tierFor(db, userId);
  const open = await db
    .select({
      id: schema.leagues.id,
      cohort: schema.leagues.cohort,
      members: sql<number>`(select count(*)::int from league_members m where m.league_id = ${schema.leagues.id})`,
    })
    .from(schema.leagues)
    .where(and(eq(schema.leagues.weekStart, weekStart), eq(schema.leagues.tier, tier)))
    .orderBy(asc(schema.leagues.cohort));
  let leagueId = open.find((l) => l.members < rules.size)?.id;
  if (!leagueId) {
    const cohort = (open.at(-1)?.cohort ?? 0) + 1;
    const [created] = await db
      .insert(schema.leagues)
      .values({ weekStart, tier, cohort, size: rules.size })
      .onConflictDoNothing()
      .returning({ id: schema.leagues.id });
    leagueId =
      created?.id ??
      (
        await db
          .select({ id: schema.leagues.id })
          .from(schema.leagues)
          .where(
            and(
              eq(schema.leagues.weekStart, weekStart),
              eq(schema.leagues.tier, tier),
              eq(schema.leagues.cohort, cohort),
            ),
          )
      )[0]?.id;
  }
  if (!leagueId) throw new Error("could not open a league");
  await db
    .insert(schema.leagueMembers)
    .values({ leagueId, userId, weekStart })
    .onConflictDoNothing();
  return leagueId;
}

export interface Standing {
  readonly userId: string;
  /**
   * The public name, or null when it is held back: the viewer hid this
   * learner, the name fails the name filter, or enough learners reported it.
   */
  readonly name: string | null;
  /** The viewer hid this learner (so the client can offer to show them again). */
  readonly hidden: boolean;
  readonly xp: number;
  readonly rank: number;
}

/**
 * Members ordered by XP earned inside the league's week (ties: earlier join
 * first). `viewerId` applies that learner's hidden list; ranks are the same
 * for every viewer, a hidden learner only loses their name.
 */
export async function standings(
  db: Db,
  leagueId: string,
  viewerId: string | null = null,
): Promise<{ weekStart: string; tier: LeagueTier; size: number; rows: Standing[] }> {
  const [league] = await db
    .select()
    .from(schema.leagues)
    .where(eq(schema.leagues.id, leagueId))
    .limit(1);
  if (!league) throw new Error(`league ${leagueId} not found`);
  // ISO strings, not Date objects: postgres.js cannot serialise a Date into an
  // unprepared query (prepare: false is required behind Hyperdrive).
  const start = `${league.weekStart}T00:00:00Z`;
  const end = `${weekEndOf(league.weekStart)}T00:00:00Z`;
  const rows = await db
    .select({
      userId: schema.leagueMembers.userId,
      name: schema.users.name,
      displayName: schema.users.displayName,
      joinedAt: schema.leagueMembers.joinedAt,
      xp: sql<number>`coalesce((select sum(x.amount) from xp_events x where x.user_id = ${schema.leagueMembers.userId} and x.created_at >= ${start}::timestamptz and x.created_at < ${end}::timestamptz), 0)::int`,
      openReports: sql<number>`(select count(*)::int from league_reports r where r.reported_user_id = ${schema.leagueMembers.userId} and r.resolved_at is null)`,
      hidden: viewerId
        ? sql<boolean>`exists (select 1 from league_hides h where h.user_id = ${viewerId} and h.hidden_user_id = ${schema.leagueMembers.userId})`
        : sql<boolean>`false`,
    })
    .from(schema.leagueMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.leagueMembers.userId))
    .where(and(eq(schema.leagueMembers.leagueId, leagueId), eq(schema.users.leaguesOptOut, false)));
  rows.sort((a, b) => b.xp - a.xp || a.joinedAt.getTime() - b.joinedAt.getTime());
  return {
    weekStart: league.weekStart,
    tier: league.tier,
    size: league.size,
    rows: rows.map((r, i) => {
      const name = leagueName(r.name, r.displayName);
      const held = r.hidden || r.openReports >= REPORTS_TO_HOLD_NAME || !nameAllowed(name);
      return {
        userId: r.userId,
        name: held ? null : name,
        hidden: r.hidden,
        xp: r.xp,
        rank: i + 1,
      };
    }),
  };
}

/** Writes final ranks and outcomes once. Safe to call again. */
export async function finalizeLeague(
  db: Db,
  leagueId: string,
  rules = LEAGUE_RULES,
): Promise<boolean> {
  const [league] = await db
    .select()
    .from(schema.leagues)
    .where(eq(schema.leagues.id, leagueId))
    .limit(1);
  if (!league || league.finalizedAt) return false;
  const s = await standings(db, leagueId);
  const decided = outcomesFor(s.rows, league.tier, rules);
  await db.transaction(async (tx) => {
    for (const d of decided) {
      await tx
        .update(schema.leagueMembers)
        .set({ finalRank: d.rank, finalXp: d.xp, outcome: d.outcome })
        .where(
          and(
            eq(schema.leagueMembers.leagueId, leagueId),
            eq(schema.leagueMembers.userId, d.userId),
          ),
        );
    }
    await tx
      .update(schema.leagues)
      .set({ finalizedAt: new Date() })
      .where(eq(schema.leagues.id, leagueId));
  });
  return true;
}

/** Finalises every league whose week is over. Runs from the nightly cron and lazily before reads. */
export async function finalizeDueLeagues(
  db: Db,
  now = new Date(),
  rules = LEAGUE_RULES,
): Promise<number> {
  const due = await db
    .select({ id: schema.leagues.id })
    .from(schema.leagues)
    .where(and(lt(schema.leagues.weekStart, weekStartOf(now)), isNull(schema.leagues.finalizedAt)));
  let n = 0;
  for (const l of due) if (await finalizeLeague(db, l.id, rules)) n++;
  return n;
}

export interface CurrentLeague {
  readonly league: {
    id: string;
    tier: LeagueTier;
    weekStart: string;
    weekEnd: string;
    size: number;
  } | null;
  readonly standings: ReadonlyArray<Standing & { isMe: boolean }>;
  readonly me: { rank: number; xp: number; zone: "promote" | "stay" | "demote" } | null;
  readonly rules: LeagueRules;
}

export async function currentLeague(
  db: Db,
  userId: string,
  now = new Date(),
  rules = LEAGUE_RULES,
): Promise<CurrentLeague> {
  const [user] = await db
    .select({ optedOut: schema.users.leaguesOptOut })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!user || user.optedOut) return { league: null, standings: [], me: null, rules };
  await finalizeDueLeagues(db, now, rules);
  const weekStart = weekStartOf(now);
  const [m] = await db
    .select({ leagueId: schema.leagueMembers.leagueId })
    .from(schema.leagueMembers)
    .where(
      and(eq(schema.leagueMembers.userId, userId), eq(schema.leagueMembers.weekStart, weekStart)),
    )
    .limit(1);
  if (!m) return { league: null, standings: [], me: null, rules };
  const s = await standings(db, m.leagueId, userId);
  const mine = s.rows.find((r) => r.userId === userId) ?? null;
  return {
    league: {
      id: m.leagueId,
      tier: s.tier,
      weekStart: s.weekStart,
      weekEnd: weekEndOf(s.weekStart),
      size: s.size,
    },
    standings: s.rows.map((r) => ({ ...r, isMe: r.userId === userId })),
    me: mine
      ? { rank: mine.rank, xp: mine.xp, zone: zoneFor(mine.rank, s.rows.length, s.tier, rules) }
      : null,
    rules,
  };
}

export interface LeagueWeek {
  readonly weekStart: string;
  readonly tier: LeagueTier;
  readonly rank: number | null;
  readonly xp: number | null;
  readonly outcome: LeagueOutcome | null;
}

/** Finalised weeks, newest first. */
export async function leagueHistory(db: Db, userId: string, limit = 8): Promise<LeagueWeek[]> {
  const rows = await db
    .select({
      weekStart: schema.leagueMembers.weekStart,
      tier: schema.leagues.tier,
      rank: schema.leagueMembers.finalRank,
      xp: schema.leagueMembers.finalXp,
      outcome: schema.leagueMembers.outcome,
    })
    .from(schema.leagueMembers)
    .innerJoin(schema.leagues, eq(schema.leagues.id, schema.leagueMembers.leagueId))
    .where(and(eq(schema.leagueMembers.userId, userId), gte(schema.leagueMembers.finalRank, 1)))
    .orderBy(desc(schema.leagueMembers.weekStart))
    .limit(limit);
  return rows;
}
