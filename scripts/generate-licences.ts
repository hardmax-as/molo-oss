import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ModuleInfos } from "license-checker-rseidelsohn";

const root = fileURLToPath(new URL("../", import.meta.url));
const legal = path.join(root, "packages/brand/legal");
const output = path.join(root, "packages/brand/generated");
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

async function noticeFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await noticeFiles(file)));
    else if (entry.isFile() && /^(licen[cs]e|notice|copying|unlicense)([.-].*)?$/i.test(entry.name))
      files.push(file);
  }
  return files.sort();
}

export async function licenceInputsHash() {
  const files = ["bun.lock", "package.json", "infra/package.json", "scripts/generate-licences.ts"];
  for (const folder of ["apps", "packages"]) {
    for (const entry of await readdir(path.join(root, folder), { withFileTypes: true })) {
      if (entry.isDirectory()) files.push(`${folder}/${entry.name}/package.json`);
    }
  }
  files.push("packages/brand/legal/attributions.en.md", "packages/brand/legal/attributions.nb.md");
  for (const file of await readdir(path.join(legal, "library-notices"))) {
    files.push(`packages/brand/legal/library-notices/${file}`);
  }
  const digest = createHash("sha256");
  for (const file of files.sort())
    digest
      .update(file)
      .update("\0")
      .update(await readFile(path.join(root, file)));
  return digest.digest("hex");
}

export async function checkLicences() {
  const inputHash = await licenceInputsHash();
  for (const file of ["libraries.web.json", "libraries.mobile.json", "attributions.json"]) {
    const data = JSON.parse(await readFile(path.join(output, file), "utf8"));
    if (data.inputHash !== inputHash)
      throw new Error(`${file} is stale. Run bun run licences:generate.`);
  }
}

async function generate() {
  const { init } = await import("license-checker-rseidelsohn");
  const inputHash = await licenceInputsHash();
  const overrides = JSON.parse(
    await readFile(path.join(legal, "library-notices/sources.json"), "utf8"),
  ) as Record<string, { file: string; source: string; sha256: string }>;
  const serialize = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`;
  await mkdir(output, { recursive: true });
  for (const app of ["web", "mobile"] as const) {
    const packages = await new Promise<ModuleInfos>((resolve, reject) => {
      init(
        {
          start: path.join(root, "apps", app),
          production: true,
          excludePrivatePackages: true,
          customFormat: { name: "", version: "", licenseText: "" },
        },
        (error, data) => (error ? reject(error) : resolve(data)),
      );
    });
    const libraries = [];
    for (const [key, entry] of Object.entries(packages).sort(([a], [b]) =>
      a.localeCompare(b, "en"),
    )) {
      if (entry.private || entry.name?.startsWith("@molo/")) continue;
      if (!entry.name || !entry.version) throw new Error(`Missing package identity: ${key}`);
      const licence = Array.isArray(entry.licenses) ? entry.licenses.join(" / ") : entry.licenses;
      if (!licence || /UNKNOWN|UNLICENSED/.test(licence))
        throw new Error(`Unresolved licence: ${key}`);
      const notices: { source: string; text: string }[] = [];
      const override = overrides[key];
      if (override) {
        const text = (
          await readFile(path.join(legal, "library-notices", override.file), "utf8")
        ).trim();
        if (hash(text) !== override.sha256) throw new Error(`Notice checksum mismatch: ${key}`);
        notices.push({ source: override.source, text });
      } else if (
        entry.licenseFile &&
        !/readme/i.test(path.basename(entry.licenseFile)) &&
        entry.licenseText
      ) {
        notices.push({ source: path.basename(entry.licenseFile), text: entry.licenseText });
      } else if (entry.licenseText?.includes("Permission is hereby granted")) {
        // A few distributions carry the complete notice in their README.
        const heading = entry.licenseText.search(/^#{1,6} (?:MIT )?Licen[cs]e/im);
        notices.push({
          source: "README (licence section)",
          text: heading >= 0 ? entry.licenseText.slice(heading) : entry.licenseText,
        });
      } else {
        throw new Error(
          `Missing licence notice: ${key}. Add a verified source in library-notices/sources.json.`,
        );
      }
      // The extractor exposes NOTICE separately from LICENSE (Apache, etc.).
      if (entry.noticeFile)
        notices.push({
          source: path.basename(entry.noticeFile),
          text: (await readFile(entry.noticeFile, "utf8")).trim(),
        });
      // Preserve additional/dual licences and bundled third-party notices too.
      // Never descend into another package's node_modules or follow symlinks.
      for (const file of await noticeFiles(entry.path!)) {
        const text = (await readFile(file, "utf8")).trim();
        if (text && !notices.some((notice) => notice.text.trim() === text))
          notices.push({ source: path.relative(entry.path!, file), text });
      }
      libraries.push({ name: entry.name, version: entry.version, licence, notices });
    }
    await writeFile(
      path.join(output, `libraries.${app}.json`),
      serialize({ inputHash, libraries }),
    );
    console.log(`${app}: ${libraries.length} library notices`);
  }
  const markdown = {
    en: await readFile(path.join(legal, "attributions.en.md"), "utf8"),
    nb: await readFile(path.join(legal, "attributions.nb.md"), "utf8"),
  };
  await writeFile(path.join(output, "attributions.json"), serialize({ inputHash, markdown }));
}

if (import.meta.main) {
  if (process.argv.includes("--check")) await checkLicences();
  else if (process.argv.includes("--live")) await generate();
  else
    console.log(
      "Would extract web/mobile production library notices and bundle legal Markdown. Use --live to write.",
    );
}
