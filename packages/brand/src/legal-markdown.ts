/** Inline syntax shared by the bundled web and mobile legal pages. No HTML. */
type InlinePart = string | { b: string } | { i: string } | { label: string; href: string };
export function inline(text: string): InlinePart[] {
  const out: InlinePart[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push({ b: m[1] });
    else if (m[2] !== undefined) out.push({ i: m[2] });
    else if (m[3] && m[4] && /^(https?:\/\/|\/(?!\/))/.test(m[4]))
      out.push({ label: m[3], href: m[4] });
    else out.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
