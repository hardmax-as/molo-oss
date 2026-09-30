import { describe, expect, it } from "vitest";

import { destructiveStatements, pendingFromJournal } from "./migrate.ts";

describe("pendingFromJournal", () => {
  const entries = [
    { idx: 0, tag: "0000_init", when: 100 },
    { idx: 1, tag: "0001_a", when: 200 },
    { idx: 2, tag: "0002_b", when: 300 },
  ];
  it("is everything on an empty database", () => {
    expect(pendingFromJournal(entries, null).map((e) => e.tag)).toEqual([
      "0000_init",
      "0001_a",
      "0002_b",
    ]);
  });
  it("is only what is newer than the last applied, like Drizzle's migrator", () => {
    expect(pendingFromJournal(entries, 200).map((e) => e.tag)).toEqual(["0002_b"]);
    expect(pendingFromJournal(entries, 300)).toEqual([]);
  });
});

describe("destructiveStatements", () => {
  it("lets additive migrations through", () => {
    const sql = `CREATE TABLE "gloss_suggestions" ("id" uuid PRIMARY KEY);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "display_name" text;--> statement-breakpoint
CREATE INDEX "web_purchases_user_idx" ON "web_purchases" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "x" ADD CONSTRAINT "x_fk" FOREIGN KEY ("y") REFERENCES "public"."z"("id") ON DELETE cascade;`;
    expect(destructiveStatements(sql)).toEqual([]);
  });
  it("flags drops, retypes, renames and truncates, one per statement", () => {
    const sql = `ALTER TABLE "user" DROP COLUMN "age_ok";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "country" SET DATA TYPE varchar(2);--> statement-breakpoint
ALTER TABLE "lexemes" RENAME COLUMN "lemma" TO "citation";--> statement-breakpoint
DROP TABLE "old_thing";--> statement-breakpoint
TRUNCATE "xp_events";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "fine" text;`;
    const flagged = destructiveStatements(sql);
    expect(flagged).toHaveLength(5);
    expect(flagged[0]).toContain("DROP COLUMN");
    expect(flagged[4]).toContain("TRUNCATE");
  });
  it("does not mistake ON DELETE cascade for a delete", () => {
    expect(
      destructiveStatements(
        `ALTER TABLE "a" ADD CONSTRAINT "a_fk" FOREIGN KEY ("b") REFERENCES "c"("id") ON DELETE set null;`,
      ),
    ).toEqual([]);
  });
});
