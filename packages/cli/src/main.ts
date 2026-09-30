#!/usr/bin/env bun
/**
 * `molo`: the ops and agent CLI (the project rules, ARCHITECTURE section 8).
 * Every mutating subcommand prints its plan and applies only with --live;
 * every subcommand supports --json; --env prod prints a red banner.
 */
import { Command } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";

import { audio } from "./commands/audio.ts";
import { auth } from "./commands/auth.ts";
import { content } from "./commands/content.ts";
import { db } from "./commands/db.ts";
import { dev } from "./commands/dev.ts";
import { doctor } from "./commands/doctor.ts";
import { logs } from "./commands/logs.ts";
import { morph } from "./commands/morph.ts";
import { notify } from "./commands/notify.ts";
import { cf, linearCmd, sentry } from "./commands/ops.ts";
import { plan } from "./commands/plan.ts";
import { user } from "./commands/user.ts";
import { CliError } from "./context.ts";
import { molo } from "./root.ts";

const cli = molo.pipe(
  Command.withDescription("Molo ops CLI. Dry-run by default; --live to apply; --json everywhere."),
  Command.withSubcommands([
    doctor,
    db,
    dev,
    content,
    audio,
    morph,
    notify,
    plan,
    user,
    auth,
    sentry,
    logs,
    cf,
    linearCmd,
  ]),
);

const run = Command.run(cli, { name: "molo", version: "0.1.0" });

run(process.argv).pipe(
  Effect.catchIf(
    (e): e is CliError => e instanceof CliError,
    (e) =>
      Effect.sync(() => {
        console.error(`error: ${e.message}`);
        process.exitCode = 1;
      }),
  ),
  Effect.provide(BunContext.layer),
  BunRuntime.runMain({ disableErrorReporting: false }),
);
