// Editing helpers that act on the textarea directly.

// Replace a range through the browser's editing pipeline so native undo keeps working.
export function replace(ta, from, to, text) {
  if (from === to && !text) return;
  ta.focus();
  ta.setSelectionRange(from, to);
  const ok = text ? document.execCommand('insertText', false, text) : document.execCommand('delete');
  if (!ok) {
    ta.setRangeText(text, from, to, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// Wrap the selection in a Markdown mark ("**", "*" or "~~"), or remove it if already there.
export function wrap(ta, mark) {
  const v = ta.value, n = mark.length;
  let s = ta.selectionStart, e = ta.selectionEnd;
  // Stars hugging the selection: two or more means bold, an odd count means italic.
  const stars = mark[0] !== '*' ? 0 : Math.min(v.slice(0, s).match(/\**$/)[0].length, v.slice(e).match(/^\**/)[0].length);
  if (n === 2 ? stars >= 2 : stars % 2) { s -= n; e += n; }
  const sel = v.slice(s, e);
  const wrapped = sel.length >= 2 * n && sel.startsWith(mark) && sel.endsWith(mark);
  const next = wrapped ? sel.slice(n, -n) : mark + sel + mark;
  replace(ta, s, e, next);
  if (wrapped) ta.setSelectionRange(s, s + next.length);
  else ta.setSelectionRange(s + n, s + n + sel.length);
}

// unit is one level of indent: two or four spaces, or a tab.
export function indent(ta, outdent, unit = '  ') {
  const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
  if (s === e && !outdent) return replace(ta, s, e, unit);
  const from = v.lastIndexOf('\n', s - 1) + 1;
  const block = v.slice(from, e);
  const width = unit === '\t' ? 4 : unit.length;
  const next = outdent ? block.replace(new RegExp(`^( {1,${width}}|\\t)`, 'gm'), '') : block.replace(/^/gm, unit);
  if (next === block) return;
  replace(ta, from, e, next);
  const shift = next.split('\n')[0].length - block.split('\n')[0].length;
  ta.setSelectionRange(Math.max(from, s + shift), from + next.length);
}

// Enter inside a list item continues the list; Enter on an empty item ends it.
// Returns true if it handled the key.
export function continueList(ta) {
  const v = ta.value, s = ta.selectionStart;
  if (s !== ta.selectionEnd) return false;
  const from = v.lastIndexOf('\n', s - 1) + 1;
  const m = v.slice(from, s).match(/^(\s*)(?:([-*+])( \[[ xX]\])?|(\d+)([.)])) (.*)$/);
  if (!m) return false;
  if (!m[6]) { replace(ta, from, s, ''); return true; }
  const marker = m[2] ? m[2] + (m[3] ? ' [ ]' : '') : (+m[4] + 1) + m[5];
  replace(ta, s, s, `\n${m[1]}${marker} `);
  return true;
}

// Find options: { caseSens, word, regex }. Returns a RegExp, or null for an empty or invalid pattern.
export function pattern(query, { caseSens, word, regex } = {}) {
  if (!query) return null;
  let src = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (word) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
  const flags = `gm${caseSens ? '' : 'i'}`;
  try { return new RegExp(src, `${flags}u`); } catch { /* try without u below */ }
  if (word) return null;
  try { return new RegExp(src, flags); } catch { return null; }
}

// Every non-empty match as [start, end]. Capped so a pattern like "." stays quick on a long text.
export function matches(text, re, cap = 10000) {
  const out = [];
  re.lastIndex = 0;
  for (let m; out.length < cap && (m = re.exec(text));) {
    if (m[0]) out.push([m.index, m.index + m[0].length]);
    else re.lastIndex++;
  }
  return out;
}

// Select the next (dir 1) or previous (dir -1) match, wrapping around.
// Returns { at, total } or null. Focus returns to wherever it was, so the find box keeps the keyboard.
export function findNext(ta, re, dir = 1) {
  if (!re) return null;
  const all = matches(ta.value, re);
  if (!all.length) return null;
  let k = dir > 0 ? all.findIndex(([s]) => s >= ta.selectionEnd) : all.findLastIndex(([, e]) => e <= ta.selectionStart);
  if (k < 0) k = dir > 0 ? 0 : all.length - 1;
  const [s, e] = all[k], back = document.activeElement;
  ta.setSelectionRange(s, e);
  ta.focus();
  if (back !== ta) back?.focus?.();
  reveal(ta, s, e - s);
  return { at: k + 1, total: all.length };
}

// Put the caret at index and scroll it near the top, for the outline.
export function goTo(ta, index) {
  ta.focus();
  ta.setSelectionRange(index, index);
  ta.scrollTop = Math.max(0, measure(ta, index, 0).top - 48);
}

// Browsers neither scroll a textarea to its selection nor draw the selection while
// focus is elsewhere. So: lay the text out in a hidden copy of the textarea to find
// where a position sits.
function measure(ta, index, length) {
  const css = getComputedStyle(ta), copy = document.createElement('div'), mark = document.createElement('span');
  Object.assign(copy.style, {
    position: 'absolute', visibility: 'hidden', top: 0, left: 0, height: 'auto', boxSizing: 'border-box',
    width: `${ta.clientWidth}px`, padding: css.padding, font: css.font, lineHeight: css.lineHeight, tabSize: css.tabSize,
    whiteSpace: ta.wrap === 'off' ? 'pre' : 'pre-wrap', overflowWrap: 'break-word',
  });
  mark.textContent = ta.value.slice(index, index + length) || '​';
  copy.append(ta.value.slice(0, index), mark);
  document.body.append(copy);
  const box = { top: mark.offsetTop, left: mark.offsetLeft, width: mark.offsetWidth, height: mark.offsetHeight };
  copy.remove();
  return box;
}

// Centre a match and draw a highlight over it until the user moves on.
function reveal(ta, index, length) {
  const { top, left, width, height } = measure(ta, index, length);
  if (top < ta.scrollTop + 60 || top > ta.scrollTop + ta.clientHeight - 60) ta.scrollTop = top - ta.clientHeight / 2;
  document.getElementById('hit')?.remove();
  const hit = Object.assign(document.createElement('div'), { id: 'hit' });
  Object.assign(hit.style, { left: `${ta.offsetLeft + left - ta.scrollLeft}px`, top: `${ta.offsetTop + top - ta.scrollTop}px`, width: `${width}px`, height: `${height}px` });
  ta.parentElement.append(hit);
  const events = ['scroll', 'input', 'focus'];
  const clear = () => { hit.remove(); events.forEach(name => ta.removeEventListener(name, clear)); };
  setTimeout(() => events.forEach(name => ta.addEventListener(name, clear)), 150);   // after our own scroll settles
}

// Replace the selected match (if the selection is one), then move to the next.
// In regex mode the replacement may use $1, $2... for captured groups.
export function replaceOne(ta, re, replacement, regex) {
  if (!re) return null;
  const s = ta.selectionStart, e = ta.selectionEnd;
  if (s !== e && matches(ta.value, re).some(([a, b]) => a === s && b === e)) {
    const back = document.activeElement;
    const text = regex ? ta.value.slice(s, e).replace(new RegExp(re.source, re.flags.replace('g', '')), replacement) : replacement;
    replace(ta, s, e, text);
    ta.setSelectionRange(s + text.length, s + text.length);
    if (back !== ta) back?.focus?.();
  }
  return findNext(ta, re);
}

// Replace every match as one undo step. Returns how many were replaced.
export function replaceAll(ta, re, replacement, regex) {
  if (!re) return 0;
  const count = (ta.value.match(re) || []).length;
  if (count) {
    const back = document.activeElement;
    replace(ta, 0, ta.value.length, ta.value.replace(re, regex ? replacement : () => replacement));
    if (back !== ta) back?.focus?.();
  }
  return count;
}

// Ctrl+K: make the selection a link and leave the caret where the address or text goes.
export function link(ta, mode) {
  const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e), url = /^(https?:\/\/|mailto:|www\.)\S+$/i.test(sel);
  if (mode === 'html') {
    const text = url ? `<a href="${sel}"></a>` : `<a href="">${sel}</a>`;
    replace(ta, s, e, text);
    const at = url ? s + text.length - 4 : s + 9;
    ta.setSelectionRange(at, at);
  } else {
    const text = url ? `[](${sel})` : `[${sel}]()`;
    replace(ta, s, e, text);
    const at = url || !sel ? s + 1 : s + text.length - 1;
    ta.setSelectionRange(at, at);
  }
}

// Ctrl+Alt+1..6 makes the current line a Markdown heading of that level; 0 makes it plain.
export function heading(ta, level) {
  const v = ta.value, s = ta.selectionStart, from = v.lastIndexOf('\n', s - 1) + 1, end = v.indexOf('\n', s), to = end < 0 ? v.length : end;
  const line = v.slice(from, to), next = (level ? `${'#'.repeat(level)} ` : '') + line.replace(/^#{1,6}\s*/, '');
  if (next === line) return;
  replace(ta, from, to, next);
  ta.setSelectionRange(from + next.length, from + next.length);
}

// Ctrl+Shift+7 / 8 / 9: turn the selected lines into a numbered, bulleted or check list,
// or back into plain lines when they already are one.
const MARKER = /^(\s*)(?:[-*+] \[[ xX]\] |[-*+] |\d+[.)] )?/;
const KIND = { number: /^\s*\d+[.)] /, bullet: /^\s*[-*+] (?!\[[ xX]\] )/, task: /^\s*[-*+] \[[ xX]\] / };
export function listify(ta, kind) {
  const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
  const from = v.lastIndexOf('\n', s - 1) + 1, end = v.indexOf('\n', e > s ? e - 1 : e), to = end < 0 ? v.length : end;
  const lines = v.slice(from, to).split('\n');
  const undo = lines.some(l => l.trim()) && lines.filter(l => l.trim()).every(l => KIND[kind].test(l));
  let n = 0;
  const next = lines.map(l => {
    if (!l.trim() && lines.length > 1) return l;
    const pad = l.match(/^\s*/)[0], body = l.replace(MARKER, '');
    if (undo) return pad + body;
    return pad + (kind === 'number' ? `${++n}. ` : kind === 'task' ? '- [ ] ' : '- ') + body;
  }).join('\n');
  replace(ta, from, to, next);
  ta.setSelectionRange(s === e ? from + next.length : from, from + next.length);
}

// A checkbox clicked in the preview ticks or unticks the task on that source line.
export function toggleTask(ta, line) {
  const v = ta.value;
  let from = 0;
  for (let i = 0; i < line; i++) { from = v.indexOf('\n', from) + 1; if (!from) return; }
  const m = v.slice(from).match(/^[>\s]*(?:[-*+]|\d+[.)])\s+\[([ xX])\]/);
  if (!m) return;
  const at = from + m[0].length - 2;
  replace(ta, at, at + 1, m[1] === ' ' ? 'x' : ' ');
}

// Optional (Settings → Editor): typing an opening bracket or quote adds its partner,
// typing the partner steps over it, and with a selection the pair wraps it. In HTML,
// finishing an opening tag with ">" adds its closing tag. Returns true if it handled the key.
const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
const CLOSERS = new Set(Object.values(PAIRS));
const VOID_TAGS = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
export function autoPair(ta, ch, mode) {
  const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
  if (s !== e && PAIRS[ch]) {
    replace(ta, s, e, ch + v.slice(s, e) + PAIRS[ch]);
    ta.setSelectionRange(s + 1, e + 1);
    return true;
  }
  if (s !== e) return false;
  if (CLOSERS.has(ch) && v[s] === ch) { ta.setSelectionRange(s + 1, s + 1); return true; }
  if (PAIRS[ch]) {
    if ((ch === "'" || ch === '"' || ch === '`') && /\w/.test(v[s - 1] || '')) return false;   // don't, "quoted"
    if (/\w/.test(v[s] || '')) return false;   // typing in front of a word
    replace(ta, s, s, ch + PAIRS[ch]);
    ta.setSelectionRange(s + 1, s + 1);
    return true;
  }
  if (ch === '>' && mode === 'html') {
    const tag = v.slice(v.lastIndexOf('\n', s - 1) + 1, s).match(/<([a-zA-Z][\w:-]*)(?:\s[^<>]*)?$/);
    if (!tag || tag[0].endsWith('/') || VOID_TAGS.test(tag[1])) return false;
    replace(ta, s, s, `></${tag[1]}>`);
    ta.setSelectionRange(s + 1, s + 1);
    return true;
  }
  return false;
}

// Backspace between an empty pair, like (|), removes both halves.
export function unpair(ta) {
  const v = ta.value, s = ta.selectionStart;
  if (s !== ta.selectionEnd || !s || PAIRS[v[s - 1]] !== v[s]) return false;
  replace(ta, s - 1, s + 1, '');
  return true;
}
