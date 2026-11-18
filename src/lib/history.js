// Version history: snapshots of each document, kept on this device apart from the
// documents themselves. history = { [docId]: [{ t, text, name? }, ...oldest first] }.
// A snapshot is taken when a document is opened, every few minutes while it is being
// edited, and before anything rewrites it wholesale (restore, Tidy, AI, type change).
// Named versions are never thinned out; unnamed ones are capped per document.

const KEY = 'margin.history';
const EVERY = 5 * 60 * 1000;
const KEEP = 50;

export function loadHistory() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

// If storage is full, drop the oldest unnamed snapshots until it fits.
export function saveHistory(history) {
  let h = history;
  for (let tries = 0; tries < 8; tries++) {
    try { localStorage.setItem(KEY, JSON.stringify(h)); return h; } catch { h = thin(h); }
  }
  return h;
}
function thin(h) {
  const out = {};
  for (const [id, list] of Object.entries(h)) {
    const unnamed = list.filter(v => !v.name);
    const drop = new Set(unnamed.slice(0, Math.ceil(unnamed.length / 2)));
    out[id] = list.filter(v => !drop.has(v));
  }
  return out;
}

// Returns a new history with the document's current text added, or the same object
// when there is nothing worth keeping. force skips the time gap; name labels it.
export function snapshot(history, doc, { force = false, name } = {}) {
  const list = history[doc.id] || [], last = list.at(-1);
  if (!doc.text.trim() && !name) return history;
  if (last && last.text === doc.text) {
    if (!name || last.name === name) return history;
    return { ...history, [doc.id]: [...list.slice(0, -1), { ...last, name }] };
  }
  if (!force && !name && last && Date.now() - last.t < EVERY) return history;
  let next = [...list, { t: Date.now(), text: doc.text, ...(name && { name }) }];
  const unnamed = next.filter(v => !v.name);
  if (unnamed.length > KEEP) next = next.filter(v => v !== unnamed[0]);
  return { ...history, [doc.id]: next };
}

export const renameVersion = (history, id, t, name) =>
  ({ ...history, [id]: (history[id] || []).map(v => (v.t === t ? { ...v, name: name || undefined } : v)) });

export function forget(history, ids) {
  const out = { ...history };
  for (const id of ids) delete out[id];
  return out;
}
