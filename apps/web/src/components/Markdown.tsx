/** Tiny renderer for our own legal markdown: headings, paragraphs, bullet lists, bold, italics and safe links. No HTML. */

import { inline } from "../../../../packages/brand/src/legal-markdown.ts";

function Inline({ text }: { text: string }) {
  return (
    <>
      {inline(text).map((part, i) =>
        typeof part === "string" ? (
          part
        ) : "b" in part ? (
          <strong key={i}>{part.b}</strong>
        ) : "href" in part ? (
          <a key={i} href={part.href} className="underline">
            {part.label}
          </a>
        ) : (
          <em key={i}>{part.i}</em>
        ),
      )}
    </>
  );
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.trim().split(/\n\s*\n/);
  return (
    <div className="prose-molo space-y-4">
      {blocks.map((block, i) => {
        if (block.startsWith("# "))
          return (
            <h1 key={i} className="font-display text-3xl font-bold text-indigo">
              {block.slice(2)}
            </h1>
          );
        if (block.startsWith("## "))
          return (
            <h2 key={i} className="mt-6 font-display text-xl font-semibold text-indigo">
              {block.slice(3)}
            </h2>
          );
        if (block.split("\n").every((l) => l.startsWith("- ")))
          return (
            <ul key={i} className="list-disc space-y-1 pl-6 text-ink">
              {block.split("\n").map((l, j) => (
                <li key={j}>
                  <Inline text={l.slice(2)} />
                </li>
              ))}
            </ul>
          );
        return (
          <p key={i} className="text-ink">
            <Inline text={block.replace(/\n/g, " ")} />
          </p>
        );
      })}
    </div>
  );
}
