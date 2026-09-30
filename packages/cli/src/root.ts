import { Command, Options } from "@effect/cli";

/**
 * The root `molo` command. Subcommands read the global flags by yielding
 * this command as a service (`const { live, json, env } = yield* molo`).
 */
export const ENVS = ["local", "preview", "prod"] as const;
export type EnvName = (typeof ENVS)[number];

const json = Options.boolean("json").pipe(Options.withDescription("Print machine-readable JSON"));
const live = Options.boolean("live").pipe(
  Options.withDescription(
    "Apply changes / call paid services. Without it every command is a dry run.",
  ),
);
const env = Options.choice("env", ENVS).pipe(
  Options.withDefault("local" as EnvName),
  Options.withDescription("Target environment; prod prints a banner and needs --live for writes"),
);

export const molo = Command.make("molo", { json, live, env });
export type Globals = { readonly json: boolean; readonly live: boolean; readonly env: EnvName };
