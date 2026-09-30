import { Command, Options } from "@effect/cli";
import { memberNotificationText, subscriptionNotificationText } from "@molo/core";
import { reminderCandidates, reminderEmail } from "@molo/gamification";
import { Effect } from "effect";

import { postSlack } from "../../../../apps/api/src/slack.ts";
import { envVar, fail, gate, kv, out, table, tryPromise, withDb } from "../context.ts";
import { molo } from "../root.ts";

/**
 * The same reminder the Worker cron sends, runnable by hand. Dry run lists
 * who would get what; --live sends through Resend (RESEND_API_KEY).
 */
const reminders = Command.make(
  "reminders",
  {
    today: Options.text("today").pipe(
      Options.withDefault(new Date().toISOString().slice(0, 10)),
      Options.withDescription("Local date YYYY-MM-DD to evaluate streaks against"),
    ),
    appUrl: Options.text("app-url").pipe(Options.withDefault("http://localhost:3300")),
  },
  ({ today, appUrl }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          const rows = yield* Effect.promise(() => reminderCandidates(db, today));
          const plan = rows.map((r) => ({
            email: r.email,
            streak: r.streak,
            lang: r.sourceLang,
            subject: reminderEmail(r, appUrl).subject,
          }));
          yield* out(g, { today, candidates: plan }, () => {
            table(plan);
            kv({
              candidates: rows.length,
              resend: envVar("RESEND_API_KEY") ? "configured" : "missing (dry run)",
            });
          });
          const apply = yield* gate(g, `send ${rows.length} reminder email(s) through Resend`);
          if (!apply) return;
          const key = envVar("RESEND_API_KEY");
          if (!key) return yield* fail("RESEND_API_KEY is not set (molo doctor)");
          const from = envVar("RESEND_FROM") ?? "Molo <no-reply@molo.example>";
          let sent = 0;
          for (const r of rows) {
            const mail = reminderEmail(r, appUrl);
            const res = yield* tryPromise(
              () =>
                fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    from,
                    to: [r.email],
                    subject: mail.subject,
                    text: mail.text,
                  }),
                }),
              `resend ${r.email}`,
            );
            if (res.ok) sent++;
            else console.error(`resend ${r.email}: ${res.status}`);
          }
          console.log(`sent ${sent} of ${rows.length}`);
        }),
      );
    }),
).pipe(
  Command.withDescription("Streak reminders: who would be emailed today; --live sends via Resend"),
);

/** Synthetic smoke test: never touches accounts or purchases. */
const slackTest = Command.make(
  "slack-test",
  {
    channel: Options.choice("channel", ["signups", "subscriptions"]).pipe(
      Options.withDefault("subscriptions"),
    ),
  },
  ({ channel }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const text =
        "[test] " +
        (channel === "signups"
          ? memberNotificationText({
              name: "Example",
              memberNumber: 84,
              provider: "apple",
              sourceLang: "nb",
            })
          : subscriptionNotificationText(
              {
                id: "cli-fixture",
                type: "INITIAL_PURCHASE",
                app_user_id: "fixture",
                product_id: "molo_plus_yearly",
                store: "APP_STORE",
                price_in_purchased_currency: 49.99,
                currency: "USD",
                environment: "SANDBOX",
              },
              12,
            ));
      yield* out(g, { channel: `#molo-${channel}`, text, synthetic: true }, () =>
        console.log(text),
      );
      if (!(yield* gate(g, `send one synthetic test to #molo-${channel}`))) return;
      if (g.env !== "prod")
        return yield* fail("Slack tests require --env prod --live; local and preview never post");
      const key =
        channel === "signups" ? "SLACK_SIGNUPS_WEBHOOK_URL" : "SLACK_SUBSCRIPTIONS_WEBHOOK_URL";
      const url = envVar(key);
      if (!url) return yield* fail(`${key} is not set (molo doctor)`);
      const result = yield* Effect.promise(() =>
        postSlack({ ENVIRONMENT: "prod", [key]: url }, text, channel),
      );
      if (!result.posted)
        return yield* fail(
          "Slack test failed; check webhook configuration (no secret values logged)",
        );
    }),
).pipe(
  Command.withDescription(
    "Preview a synthetic Slack message; --env prod --live sends one, with no purchase or database write",
  ),
);

export const notify = Command.make("notify", {}).pipe(
  Command.withDescription("Learner reminders and operational Slack smoke tests"),
  Command.withSubcommands([reminders, slackTest]),
);
