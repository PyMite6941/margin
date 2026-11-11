// Editing helpers that act on the textarea directly.

// Replace a range through the browser's editing pipeline so native undo keeps working.
function replace(ta, from, to, text) {
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
