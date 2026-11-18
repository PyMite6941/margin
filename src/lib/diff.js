// What changed between two texts, for version history. Lines are compared first, then
// words inside changed lines, so a one-word edit in a long paragraph shows as one word.
// Returns [[op, text], ...] where op is '=' (same), '+' (added) or '-' (removed).

const LINES = /[^\n]*\n|[^\n]+$/g;
const WORDS = /\s+|[\p{L}\p{N}_'’-]+|\S/gu;
const LIMIT = 4e6;   // cells in the comparison table; beyond this a block shows as replaced whole

function compare(a, b, out) {
  let s = 0, e = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const A = a.slice(s, a.length - e), B = b.slice(s, b.length - e);
  push(out, '=', a.slice(0, s).join(''));
  if (A.length * B.length > LIMIT || !A.length || !B.length) {
    push(out, '-', A.join(''));
    push(out, '+', B.join(''));
  } else {
    // Longest common subsequence, filled from the end so the walk below goes forwards.
    const w = B.length + 1, L = new Uint32Array((A.length + 1) * w);
    for (let i = A.length - 1; i >= 0; i--)
      for (let j = B.length - 1; j >= 0; j--)
        L[i * w + j] = A[i] === B[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    let i = 0, j = 0;
    while (i < A.length && j < B.length) {
      if (A[i] === B[j]) { push(out, '=', A[i]); i++; j++; }
      else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) push(out, '-', A[i++]);
      else push(out, '+', B[j++]);
    }
    push(out, '-', A.slice(i).join(''));
    push(out, '+', B.slice(j).join(''));
  }
  push(out, '=', a.slice(a.length - e).join(''));
  return out;
}

function push(out, op, text) {
  if (!text) return;
  const last = out.at(-1);
  if (last?.[0] === op) last[1] += text;
  else out.push([op, text]);
}

export function diff(before, after) {
  const lines = compare(before.match(LINES) || [], after.match(LINES) || [], []);
  // A removed block next to an added one is an edit: compare those word by word, unless
  // little survived, where a clean "old lines, new lines" reads better than confetti.
  const out = [];
  for (let k = 0; k < lines.length; k++) {
    const [op, text] = lines[k], next = lines[k + 1];
    if (op === '-' && next?.[0] === '+' && text.length + next[1].length < 40000) {
      const words = compare(text.match(WORDS) || [], next[1].match(WORDS) || [], []);
      const kept = words.reduce((n, [o, t]) => n + (o === '=' ? t.replace(/\s/g, '').length : 0), 0);
      if (kept >= 0.5 * Math.max(text.replace(/\s/g, '').length, next[1].replace(/\s/g, '').length)) words.forEach(([o, t]) => push(out, o, t));
      else { push(out, '-', text); push(out, '+', next[1]); }
      k++;
    } else push(out, op, text);
  }
  return out;
}

// How many words were added and removed, for the version list.
export function changeSize(parts) {
  const count = op => parts.reduce((n, [o, t]) => n + (o === op ? (t.match(/\S+/g) || []).length : 0), 0);
  return { added: count('+'), removed: count('-') };
}
