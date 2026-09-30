import { CLICK_LETTERS } from "@molo/core";

/**
 * Renders isiXhosa with the click consonants in their fixed colours
 * (DESIGN.md "Learning first": c sea, x sun, q coral) so a learner sees the
 * click before hearing it. Digraphs (gc, xh, nq ...) keep their click letter
 * coloured and the rest plain.
 */
export function ClickText({ text, className = "" }: { text: string; className?: string }) {
  // Everything routed through here is isiXhosa: tagging it lets a screen
  // reader switch voice instead of reading it as English (WCAG 3.1.2).
  return (
    <span className={className} lang="xh">
      {[...text].map((ch, i) => {
        const lower = ch.toLowerCase();
        if (!CLICK_LETTERS.has(lower)) return <span key={i}>{ch}</span>;
        return (
          <span key={i} className={`click-${lower} font-bold`}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}

/** The distinct click letters in a string, in order of appearance. */
export function clickLettersIn(text: string): string[] {
  const seen: string[] = [];
  for (const ch of text.toLowerCase())
    if (CLICK_LETTERS.has(ch) && !seen.includes(ch)) seen.push(ch);
  return seen;
}
