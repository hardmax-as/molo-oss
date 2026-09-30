import { Args, Command, Options } from "@effect/cli";
import { grantEntitlement, planOf, revokeEntitlement } from "@molo/gamification";
import { Effect, Option } from "effect";

import { gate, kv, out, withDb } from "../context.ts";
import { molo } from "../root.ts";
import { refunds } from "./refunds.ts";

/** Manual or promo access to Molo Plus, for testers and goodwill before the stores exist. */
const grant = Command.make(
  "grant",
  {
    userId: Args.text({ name: "userId" }),
    days: Options.integer("days").pipe(
      Options.optional,
      Options.withDescription("Expires after N days; omit for no expiry"),
    ),
    source: Options.choice("source", ["manual", "promo"]).pipe(
      Options.withDefault("manual" as const),
    ),
  },
  ({ userId, days, source }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          const d = Option.getOrUndefined(days);
          const expiresAt = d ? new Date(Date.now() + d * 86_400_000) : null;
          const apply = yield* gate(
            g,
            `grant plus to ${userId} (${source}, ${expiresAt ? `until ${expiresAt.toISOString().slice(0, 10)}` : "no expiry"})`,
          );
          if (!apply) return;
          yield* Effect.promise(() => grantEntitlement(db, userId, "plus", source, expiresAt));
          const plan = yield* Effect.promise(() => planOf(db, userId));
          yield* out(g, plan, () => kv(plan as unknown as Record<string, unknown>));
        }),
      );
    }),
).pipe(Command.withDescription("Grant Molo Plus by hand (--live)"));

const revoke = Command.make("revoke", { userId: Args.text({ name: "userId" }) }, ({ userId }) =>
  Effect.gen(function* () {
    const g = yield* molo;
    yield* withDb(g, (db) =>
      Effect.gen(function* () {
        const apply = yield* gate(g, `revoke plus from ${userId}`);
        if (!apply) return;
        yield* Effect.promise(() => revokeEntitlement(db, userId, "plus"));
        const plan = yield* Effect.promise(() => planOf(db, userId));
        yield* out(g, plan, () => kv(plan as unknown as Record<string, unknown>));
      }),
    );
  }),
).pipe(Command.withDescription("Revoke a manual or promo grant (--live)"));

const show = Command.make("show", { userId: Args.text({ name: "userId" }) }, ({ userId }) =>
  Effect.gen(function* () {
    const g = yield* molo;
    yield* withDb(g, (db) =>
      Effect.gen(function* () {
        const plan = yield* Effect.promise(() => planOf(db, userId));
        yield* out(g, plan, () => kv(plan as unknown as Record<string, unknown>));
      }),
    );
  }),
).pipe(Command.withDescription("Show a learner's plan"));

export const plan = Command.make("plan", {}).pipe(
  Command.withDescription("Molo Plus entitlements: show, grant, revoke"),
  Command.withSubcommands([show, grant, revoke, refunds]),
);
