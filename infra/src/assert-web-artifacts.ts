import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Fail the build if a source map could be served, including failed plugin cleanup. */
export async function assertNoServedMaps(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) await assertNoServedMaps(join(directory, entry.name));
    else if (entry.name.endsWith(".map"))
      throw new Error("A source map remains in the public web bundle; refusing deployment");
  }
}

/**
 * Fail the build if `/build.json` is missing or names a build the bundle does
 * not carry: an open editor page compares the two to offer a refresh
 * (apps/web/src/lib/build-version.ts), and a silent 404 would turn that off.
 */
export async function assertBuildStamp(directory: string): Promise<string> {
  let build: unknown;
  try {
    build = (
      JSON.parse(await readFile(join(directory, "build.json"), "utf8")) as { build?: unknown }
    ).build;
  } catch {
    throw new Error("build.json is missing from the public web bundle; refusing deployment");
  }
  if (typeof build !== "string" || !build.trim())
    throw new Error("build.json names no build; refusing deployment");
  const assets = join(directory, "assets");
  for (const name of await readdir(assets))
    if (name.endsWith(".js") && (await readFile(join(assets, name), "utf8")).includes(build))
      return build;
  throw new Error(`no client chunk carries build ${build}; refusing deployment`);
}

if (import.meta.main) {
  const client = fileURLToPath(new URL("../../apps/web/dist/client", import.meta.url));
  await assertNoServedMaps(client);
  console.log("Web bundle contains no served source maps.");
  console.log(`Web bundle is stamped with build ${await assertBuildStamp(client)}.`);
}
