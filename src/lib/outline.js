// The headings of a document, for the outline panel: [{ level, text, index }] where
// index is the heading's position in the text. Plain text has no headings.

export function headings(text, mode) {
  const out = [];
  if (mode === 'md') {
    let fenced = false, index = 0;
    for (const line of text.split('\n')) {
      if (line.startsWith('```')) fenced = !fenced;
      const m = !fenced && line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (m && m[2]) out.push({ level: m[1].length, text: m[2].replace(/[*_`~]/g, ''), index });
      index += line.length + 1;
    }
  } else if (mode === 'html') {
    for (const m of text.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)) {
      const label = m[2].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
      if (label) out.push({ level: +m[1], text: label, index: m.index });
    }
  }
  return out;
}
