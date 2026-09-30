import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { checkPublisher, eas, mobileRoot, repoRoot, run, summary } from "./mobile-command.ts";
import { releasePlan } from "./mobile-release-policy.ts";

const { values } = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    profile: { type: "string", default: "preview" },
    platform: { type: "string", default: "all" },
    version: { type: "string" },
    "auto-submit": { type: "boolean", default: false },
    live: { type: "boolean", default: false },
  },
});
const config = JSON.parse(readFileSync(join(mobileRoot, "app.json"), "utf8")) as {
  expo: { version: string };
};
const plan = releasePlan({
  profile: values.profile!,
  platform: values.platform!,
  version: values.version ?? "",
  appVersion: config.expo.version,
  autoSubmit: values["auto-submit"]!,
});
const tags = run(
  ["git", "tag", "--list", "mobile/v*", "--sort=-version:refname"],
  repoRoot,
  true,
).split("\n");
if (tags.includes(plan.tag))
  throw new Error("This mobile release tag already exists; bump app.json before building");
if (!values.live) {
  summary(
    `Dry run: eas ${plan.args.join(" ")}; ${values.profile === "production" ? `then tag ${plan.tag} and create its GitHub release` : "no release tag for preview"}. Pass --live to apply.`,
  );
} else {
  checkPublisher();
  eas(plan.args);
  if (values.profile === "production") {
    const previous = tags.find((tag) => /^mobile\/v\d+\.\d+\.\d+$/.test(tag));
    const commits = run(
      ["git", "log", "--format=- %s (%h)", ...(previous ? [`${previous}..HEAD`] : ["HEAD"])],
      repoRoot,
      true,
    );
    const scratch = mkdtempSync(join(tmpdir(), "molo-mobile-release-"));
    try {
      const notes = join(scratch, "notes.md");
      writeFileSync(notes, `Mobile ${values.version}\n\n${commits}\n`);
      run([
        "git",
        "-c",
        "user.name=github-actions[bot]",
        "-c",
        "user.email=41898282+github-actions[bot]@users.noreply.github.com",
        "tag",
        "-a",
        plan.tag,
        "-m",
        `Mobile ${values.version}`,
      ]);
      run(["git", "push", "origin", `refs/tags/${plan.tag}`]);
      run([
        "gh",
        "release",
        "create",
        plan.tag,
        "--verify-tag",
        "--title",
        `Mobile ${values.version}`,
        "--notes-file",
        notes,
      ]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}
