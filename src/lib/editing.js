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

// Wrap the selection in a Markdown mark ("**" or "*"), or remove it if already there.
export function wrap(ta, mark) {
  const v = ta.value, n = mark.length;
  let s = ta.selectionStart, e = ta.selectionEnd;
  // Stars hugging the selection: two or more means bold, an odd count means italic.
  const stars = Math.min(v.slice(0, s).match(/\**$/)[0].length, v.slice(e).match(/^\**/)[0].length);
  if (n === 2 ? stars >= 2 : stars % 2) { s -= n; e += n; }
  const sel = v.slice(s, e);
  const wrapped = sel.length >= 2 * n && sel.startsWith(mark) && sel.endsWith(mark);
  const next = wrapped ? sel.slice(n, -n) : mark + sel + mark;
  replace(ta, s, e, next);
  if (wrapped) ta.setSelectionRange(s, s + next.length);
  else ta.setSelectionRange(s + n, s + n + sel.length);
}

export function indent(ta, outdent) {
  const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
  if (s === e && !outdent) return replace(ta, s, e, '  ');
  const from = v.lastIndexOf('\n', s - 1) + 1;
  const block = v.slice(from, e);
  const next = outdent ? block.replace(/^( {1,2}|\t)/gm, '') : block.replace(/^/gm, '  ');
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

// Select the next (dir 1) or previous (dir -1) match, wrapping around. Case-insensitive.
// Focus returns to wherever it was, so the find box keeps the keyboard.
export function findNext(ta, query, dir = 1) {
  if (!query) return false;
  const hay = ta.value.toLowerCase(), needle = query.toLowerCase();
  let i = dir > 0 ? hay.indexOf(needle, ta.selectionEnd) : ta.selectionStart ? hay.lastIndexOf(needle, ta.selectionStart - 1) : -1;
  if (i < 0) i = dir > 0 ? hay.indexOf(needle) : hay.lastIndexOf(needle);
  if (i < 0) return false;
  const back = document.activeElement;
  ta.setSelectionRange(i, i + needle.length);
  ta.focus();
  if (back !== ta) back?.focus?.();
  reveal(ta, i, needle.length);
  return true;
}

// Browsers neither scroll a textarea to its selection nor draw the selection while
// focus is elsewhere. So: lay the text out in a hidden copy of the textarea to find
// where the match sits, centre it, and draw a highlight over it until the user moves on.
function reveal(ta, index, length) {
  const css = getComputedStyle(ta), copy = document.createElement('div'), mark = document.createElement('span');
  Object.assign(copy.style, {
    position: 'absolute', visibility: 'hidden', top: 0, left: 0, height: 'auto', boxSizing: 'border-box',
    width: `${ta.clientWidth}px`, padding: css.padding, font: css.font, lineHeight: css.lineHeight, tabSize: css.tabSize,
    whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
  });
  mark.textContent = ta.value.slice(index, index + length);
  copy.append(ta.value.slice(0, index), mark);
  document.body.append(copy);
  const { offsetTop: top, offsetLeft: left, offsetWidth: width, offsetHeight: height } = mark;
  copy.remove();
  if (top < ta.scrollTop + 60 || top > ta.scrollTop + ta.clientHeight - 60) ta.scrollTop = top - ta.clientHeight / 2;

  document.getElementById('hit')?.remove();
  const hit = Object.assign(document.createElement('div'), { id: 'hit' });
  Object.assign(hit.style, { left: `${ta.offsetLeft + left}px`, top: `${ta.offsetTop + top - ta.scrollTop}px`, width: `${width}px`, height: `${height}px` });
  ta.parentElement.append(hit);
  const events = ['scroll', 'input', 'focus'];
  const clear = () => { hit.remove(); events.forEach(name => ta.removeEventListener(name, clear)); };
  setTimeout(() => events.forEach(name => ta.addEventListener(name, clear)), 150);   // after our own scroll settles
}

// Replace the selected match (if the selection is one), then move to the next.
export function replaceOne(ta, query, replacement) {
  const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
  if (query && sel.toLowerCase() === query.toLowerCase()) {
    const back = document.activeElement;
    replace(ta, ta.selectionStart, ta.selectionEnd, replacement);
    if (back !== ta) back?.focus?.();
  }
  return findNext(ta, query);
}

// Replace every match as one undo step. Returns how many were replaced.
export function replaceAll(ta, query, replacement) {
  if (!query) return 0;
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const count = (ta.value.match(pattern) || []).length;
  if (count) {
    const back = document.activeElement;
    replace(ta, 0, ta.value.length, ta.value.replace(pattern, () => replacement));
    if (back !== ta) back?.focus?.();
  }
  return count;
}
