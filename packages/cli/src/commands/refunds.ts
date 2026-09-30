import { Args, Command, Options } from "@effect/cli";
import { completeWebRefund, pendingWebRefunds, pruneWebPurchases } from "@molo/db";
import { Effect } from "effect";

import { CliError, gate, out, withDb } from "../context.ts";
import { molo } from "../root.ts";

const list = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const g = yield* molo;
    yield* withDb(g, (db) =>
      Effect.gen(function* () {
        const rows = yield* Effect.promise(() => pendingWebRefunds(db));
        yield* out(g, rows, () => JSON.stringify(rows, null, 2));
      }),
    );
  }),
).pipe(Command.withDescription("List web withdrawals awaiting cancellation and refund; read-only"));
const complete = Command.make(
  "complete",
  {
    id: Args.text({ name: "purchaseId" }),
    reference: Options.text("reference"),
    cancelled: Options.boolean("renewal-cancelled"),
  },
  ({ id, reference, cancelled }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      if (!cancelled || !reference.trim())
        return yield* Effect.fail(
          new CliError({
            message:
              "Confirm --renewal-cancelled and supply --reference after processing the actual refund.",
          }),
        );
      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          if (
            !(yield* gate(
              g,
              `record completed refund ${id}, reference ${reference}; renewal already cancelled`,
            ))
          )
            return;
          const row = yield* Effect.promise(() => completeWebRefund(db, id, reference));
          yield* out(g, row, () => JSON.stringify(row));
        }),
      );
    }),
).pipe(
  Command.withDescription(
    "Record an externally completed refund and cancellation (--live); never moves money",
  ),
);
const prune = Command.make("prune", {}, () =>
  Effect.gen(function* () {
    const g = yield* molo;
    yield* withDb(g, (db) =>
      Effect.gen(function* () {
        const count = yield* Effect.promise(() => pruneWebPurchases(db, false));
        const apply = yield* gate(
          g,
          `remove ${count} expired checkout/accounting records; pending refunds are retained`,
        );
        const removed = apply ? yield* Effect.promise(() => pruneWebPurchases(db, true)) : 0;
        yield* out(
          g,
          { candidates: count, removed },
          () => `${count} candidates, ${removed} removed`,
        );
      }),
    );
  }),
).pipe(
  Command.withDescription(
    "Enforce purchase-record retention (dry-run; --live deletes expired records)",
  ),
);
export const refunds = Command.make("refunds", {}).pipe(
  Command.withDescription("Manual web refunds and purchase-record retention"),
  Command.withSubcommands([list, complete, prune]),
);
