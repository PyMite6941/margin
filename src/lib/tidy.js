// Re-indents HTML: block elements on their own lines, two spaces per level, inline
// elements and text left flowing inside them. A block whose content fits on one line
// stays on one line. <pre>, <textarea>, <script> and <style> keep their insides as written.
// Best effort: it never drops content, and markup it cannot follow is left as found.

const INLINE = new Set('a abbr b bdi bdo br button cite code data dfn em i img input kbd label mark q s samp select small span strong sub sup time u var wbr del ins'.split(' '));
const VOID = new Set('area base br col embed hr img input link meta source track wbr'.split(' '));
const RAW = new Set(['pre', 'textarea', 'script', 'style']);
// Opening one of these closes an unclosed sibling of the listed kinds.
const AUTO_CLOSE = { li: ['li'], p: ['p'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], tr: ['tr', 'td', 'th'], td: ['td', 'th'], th: ['td', 'th'], option: ['option'] };
const TOKEN = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-zA-Z][\w:-]*)(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g;
const WIDTH = 100;

export function tidy(src) {
  const out = [], stack = [];   // stack: { name, line, nested } for open block elements
  let cur = '', curDepth = 0;
  const pad = n => '  '.repeat(n);
  const flush = () => { if (cur.trim()) out.push(pad(curDepth) + cur.trim()); cur = ''; };
  const inline = s => { if (!cur) curDepth = stack.length; cur += s; };
  const line = s => { flush(); if (stack.length) stack.at(-1).nested = true; out.push(pad(stack.length) + s); };
  function close(name) {
    const at = stack.map(e => e.name).lastIndexOf(name);
    if (at < 0) return false;
    while (stack.length - 1 > at) close(stack.at(-1).name);   // unclosed children, e.g. <li> without </li>
    flush();
    const { line: start, nested } = stack[at];
    stack.length = at;
    const tag = `</${name}>`;
    const inner = out.slice(start + 1).map(l => l.trim());
    const joined = out[start] + inner.join(' ') + tag;
    // Keep short blocks on one line: <p>Hello <b>you</b></p>
    if (!nested && inner.length <= 1 && joined.length <= WIDTH) out.splice(start, out.length - start, joined);
    else out.push(pad(at) + tag);
    return true;
  }

  const text = src.replace(/\r\n?/g, '\n');
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text))) {
    const tok = m[0], name = m[1]?.toLowerCase();
    if (!name) {
      if (tok.startsWith('<!')) line(tok.startsWith('<!--') ? tok.trim() : tok);
      else inline(tok.replace(/\s+/g, ' '));
      continue;
    }
    if (tok[1] === '/') {
      if (INLINE.has(name)) inline(tok);
      else if (!close(name)) line(tok);
      continue;
    }
    if (INLINE.has(name)) { inline(tok); continue; }
    for (const sibling of AUTO_CLOSE[name] || []) if (stack.at(-1)?.name === sibling) close(sibling);
    if (RAW.has(name)) {
      const end = text.toLowerCase().indexOf(`</${name}`, TOKEN.lastIndex);
      const stop = end < 0 ? text.length : text.indexOf('>', end) + 1 || text.length;
      line(text.slice(m.index, stop).replace(/^\n+|\s+$/g, ''));
      TOKEN.lastIndex = stop;
      continue;
    }
    if (VOID.has(name) || tok.endsWith('/>')) { line(tok); continue; }
    line(tok);
    stack.push({ name, line: out.length - 1 });
  }
  flush();
  return out.join('\n') + '\n';
}
