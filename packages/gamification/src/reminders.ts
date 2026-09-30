/**
 * Daily reminder candidates: learners who asked for reminders, have a
 * streak to lose, and have not earned XP today. Pure query; sending is the
 * caller's job (Worker cron with Resend, or `molo notify reminders`).
 */

import { schema, type Db } from "@molo/db";
import { and, eq, gt, ne, or, isNull } from "drizzle-orm";

export interface ReminderCandidate {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly streak: number;
  readonly sourceLang: "en" | "nb";
}

export async function reminderCandidates(db: Db, todayIso: string): Promise<ReminderCandidate[]> {
  const rows = await db
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      streak: schema.streaks.current,
      sourceLang: schema.userPrefs.sourceLang,
    })
    .from(schema.userPrefs)
    .innerJoin(schema.users, eq(schema.users.id, schema.userPrefs.userId))
    .innerJoin(schema.streaks, eq(schema.streaks.userId, schema.userPrefs.userId))
    .where(
      and(
        eq(schema.userPrefs.reminderOptIn, true),
        gt(schema.streaks.current, 0),
        or(isNull(schema.streaks.lastActiveDate), ne(schema.streaks.lastActiveDate, todayIso)),
      ),
    );
  return rows;
}

/** The email body, in the learner's source language. Kept here so the cron and the CLI send the same text. */
export function reminderEmail(
  c: ReminderCandidate,
  appUrl: string,
): { subject: string; text: string } {
  if (c.sourceLang === "nb") {
    return {
      subject: `Molo: ${c.streak} dager på rad, ikke mist dem`,
      text: `Molo ${c.name}!\n\nDu har ${c.streak} dager på rad i Molo. En kort leksjon i dag holder rekken i live.\n\n${appUrl}\n\nDu kan skru av påminnelser under Innstillinger.`,
    };
  }
  return {
    subject: `Molo: a ${c.streak}-day streak is waiting for you`,
    text: `Molo ${c.name}!\n\nYour ${c.streak}-day streak in Molo ends tonight unless you do one short lesson today.\n\n${appUrl}\n\nYou can turn reminders off under Settings.`,
  };
}
