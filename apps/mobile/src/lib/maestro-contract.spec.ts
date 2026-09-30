/** @jest-environment node */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { parseSync, traverse, types as babel } from "@babel/core";

const mobile = resolve(__dirname, "../..");
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A template is a constrained ID family; opaque forwarded props are never a wildcard. */
function idFamilies(source: string): RegExp[] {
  const found: RegExp[] = [];
  const add = (node: babel.Node | null | undefined): void => {
    if (babel.isStringLiteral(node)) found.push(new RegExp(`^${escape(node.value)}$`));
    else if (babel.isTemplateLiteral(node)) {
      const chunks = node.quasis.map((q) => q.value.cooked ?? q.value.raw);
      if (chunks.some(Boolean)) found.push(new RegExp(`^${chunks.map(escape).join(".+")}$`));
    } else if (babel.isConditionalExpression(node)) {
      add(node.consequent);
      add(node.alternate);
    } else if (babel.isLogicalExpression(node)) add(node.right);
    else if (babel.isTSAsExpression(node)) add(node.expression);
  };
  const ast = parseSync(source, {
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
  });
  if (!ast) throw new Error("Could not parse mobile source");
  traverse(ast, {
    JSXAttribute(path) {
      if (!babel.isJSXIdentifier(path.node.name, { name: "testID" })) return;
      const value = path.node.value;
      add(babel.isJSXExpressionContainer(value) ? value.expression : value);
    },
    ObjectProperty(path) {
      const key = path.node.key;
      if (
        babel.isIdentifier(key, { name: "testID" }) ||
        babel.isStringLiteral(key, { value: "testID" })
      )
        add(path.node.value);
    },
  });
  return found;
}

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = join(directory, entry.name);
    if (entry.isDirectory()) return files(name);
    return /\.[jt]sx?$/.test(entry.name) && !/\.(?:spec|test|d)\.tsx?$/.test(entry.name)
      ? [name]
      : [];
  });
}
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}
function selectors(value: unknown): { kind: "id" | "text"; pattern: string }[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) => {
    if (key === "id" || key === "text") {
      if (typeof item !== "string") throw new Error(`${key} selector must be a string`);
      return [{ kind: key, pattern: item }];
    }
    return selectors(item);
  });
}

// Bun is the repository/CI runtime; its built-in YAML parser returns both Maestro
// documents (header and command list). No YAML package is added to the app.
const parsed = JSON.parse(
  execFileSync(
    "bun",
    [
      "-e",
      `
  import {readdirSync,readFileSync} from "node:fs";
  import {join} from "node:path";
  const directory=process.argv[1];
  console.log(JSON.stringify(readdirSync(directory).filter(x=>x.endsWith(".yaml")).sort().map(name=>({name,documents:Bun.YAML.parse(readFileSync(join(directory,name),"utf8"))}))));
`,
      join(mobile, "maestro"),
    ],
    { encoding: "utf8" },
  ),
) as { name: string; documents: unknown }[];
const sourceIds = [...files(join(mobile, "app")), ...files(join(mobile, "src"))].flatMap((file) =>
  idFamilies(readFileSync(file, "utf8")),
);
const copy = ["en", "nb"].flatMap((lang) =>
  strings(
    JSON.parse(readFileSync(join(mobile, `../../packages/i18n/src/locales/${lang}.json`), "utf8")),
  ),
);

function resolvesId(pattern: string, ids = sourceIds): boolean {
  // Concrete IDs match constrained source templates directly. For regex selectors,
  // also test literal source IDs against Maestro's whole-label regex semantics.
  const selector = new RegExp(`^(?:${pattern})$`);
  return ids.some(
    (family) =>
      family.test(pattern) ||
      (family.source.startsWith("^") &&
        !family.source.includes(".+") &&
        selector.test(family.source.slice(1, -1).replace(/\\(.)/g, "$1"))),
  );
}

describe("Maestro selectors stay connected to the app", () => {
  it("finds every YAML flow and both documents", () => {
    expect(parsed.length).toBeGreaterThan(0);
    for (const flow of parsed) {
      expect(Array.isArray(flow.documents)).toBe(true);
      expect((flow.documents as unknown[])[0]).toMatchObject({ appId: "com.hardmax.molo" });
      expect(Array.isArray((flow.documents as unknown[])[1])).toBe(true);
    }
  });
  it.each(parsed)("$name uses existing testIDs and translated text", ({ documents }) => {
    for (const { kind, pattern } of selectors(documents)) {
      if (kind === "id")
        expect({ pattern, resolves: resolvesId(pattern) }).toEqual({ pattern, resolves: true });
      else {
        const regex = new RegExp(`^(?:${pattern})$`);
        expect({ pattern, translated: copy.some((text) => regex.test(text)) }).toEqual({
          pattern,
          translated: true,
        });
      }
    }
  });
  it("accepts static, conditional and template IDs without treating forwarded props or comments as declarations", () => {
    const ids = idFamilies(
      'const a = <View testID="static-id"/>; const b = <View testID={`click-${c}`}/>; const d = <View testID={isMe ? "league-me" : undefined}/>; const e = <View testID={testID}/>; // testID="removed"',
    );
    expect(resolvesId("static-id", ids)).toBe(true);
    expect(resolvesId("static-.*", ids)).toBe(true);
    expect(resolvesId("click-x", ids)).toBe(true);
    expect(resolvesId("click-.*", ids)).toBe(true);
    expect(resolvesId("league-me", ids)).toBe(true);
    expect(resolvesId("removed", ids)).toBe(false);
    expect(resolvesId("open-settings", ids)).toBe(false);
    expect(resolvesId("other-x", ids)).toBe(false);
  });
});
