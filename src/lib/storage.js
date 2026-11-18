// Documents and preferences, kept in localStorage on this device.
// doc = { id, text, created, updated, mode?, file?, path?, pinned?, trashed? }
// (mode: see modes.js, file: name on disk, path: desktop only, trashed: when it was deleted)
import { modeOf } from './modes.js';

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };

export const uid = () => Math.random().toString(36).slice(2, 10);
export const newDoc = (text = '', extra) => ({ id: uid(), text, created: Date.now(), updated: Date.now(), ...extra });
// Words a reader sees: HTML loses its tags, other modes are taken as they are.
export const plainText = doc => (modeOf(doc) === 'html' ? doc.text.replace(/<(script|style|head)[\s\S]*?<\/\1>|<[^>]*>/gi, ' ') : doc.text);
export function titleOf(doc) {
  const named = modeOf(doc) === 'html' && doc.text.match(/<(title|h1)[^>]*>([^<]*)</i)?.[2].trim();
  const first = named || plainText(doc).match(/\S.*/)?.[0] || '';
  return (modeOf(doc) === 'md' ? first.replace(/^#+\s*/, '') : first).trim().slice(0, 60) || 'Untitled';
}

const WELCOME = `# Welcome to Margin

A quiet place to write. Everything you type is kept on this device. Nothing is uploaded.

## The basics

- **New** starts a document. The first line becomes its title.
- **Save** writes a real file to your disk. **Open** reads one back.
- The view button switches between Write, Split and Read.
- **Focus** hides everything except the page. Press Esc to come back.
- The gear at the bottom of the sidebar opens Settings: theme, typeface, text size, line width.
- The type menu switches between Markdown, HTML and plain text.
- **Outline** lists your headings. The **⋯** menu has version history, copies and export.
- Deleted documents wait in the trash for 30 days.

## Formatting

Margin understands Markdown, so *emphasis*, **strong text**, \`code\` and [links](https://example.com) work as you would expect.

- [x] Lists continue when you press Enter
- [ ] Tab and Shift+Tab indent them
- [ ] Ctrl+B and Ctrl+I wrap the selection

> Delete this note whenever you like. The Guide link in the sidebar has the full reference.
`;

// Deleted documents wait in the trash (doc.trashed = when) and are purged after this long.
export const TRASH_DAYS = 30;
export const isLive = d => !d.trashed;
// There is always at least one document that is not in the trash.
export const ensureLive = docs => (docs.some(isLive) ? docs : [...docs, newDoc()]);

export function loadDocs() {
  const docs = read('margin.docs', null);
  if (!Array.isArray(docs) || !docs.length) return [newDoc(WELCOME)];
  const cutoff = Date.now() - TRASH_DAYS * 864e5;
  return ensureLive(docs.filter(d => !d.trashed || d.trashed > cutoff));
}
export const saveDocs = docs => write('margin.docs', docs);

// Settings that Reset puts back. view, sidebar and outline are layout state, not settings.
export const DEFAULT_PREFS = {
  theme: 'auto', font: 'serif', size: 18, width: 68, leading: 1.65,       // appearance
  spell: true, wrap: true, indent: '2', lists: true, pairs: false,         // editor
  newMode: 'md', sort: 'updated', confirmTrash: false, autoWrite: false,   // documents and files
};
export const loadPrefs = () => ({ ...DEFAULT_PREFS, view: 'write', sidebar: innerWidth > 700, outline: false, ...read('margin.prefs', {}) });
export const savePrefs = prefs => write('margin.prefs', prefs);

export const loadLastId = () => read('margin.last', null);
export const saveLastId = id => write('margin.last', id);
