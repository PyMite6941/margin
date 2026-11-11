// Documents and preferences, kept in localStorage on this device.
// doc = { id, text, updated, file?, path? }  (file: name on disk, path: desktop only)

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };

export const uid = () => Math.random().toString(36).slice(2, 10);
export const newDoc = (text = '', extra) => ({ id: uid(), text, updated: Date.now(), ...extra });
export const titleOf = doc => (doc.text.match(/\S.*/)?.[0] || '').replace(/^#+\s*/, '').slice(0, 60) || 'Untitled';

const WELCOME = `# Welcome to Margin

A quiet place to write. Everything you type is kept on this device. Nothing is uploaded.

## The basics

- **New** starts a document. The first line becomes its title.
- **Save** writes a real file to your disk. **Open** reads one back.
- The view button switches between Write, Split and Read.
- **Focus** hides everything except the page. Press Esc to come back.
- **Aa** changes theme, typeface, text size and line width.

## Formatting

Margin understands Markdown, so *emphasis*, **strong text**, \`code\` and [links](https://example.com) work as you would expect.

- [x] Lists continue when you press Enter
- [ ] Tab and Shift+Tab indent them
- [ ] Ctrl+B and Ctrl+I wrap the selection

> Delete this note whenever you like. The Guide link in the sidebar has the full reference.
`;

export function loadDocs() {
  const docs = read('margin.docs', null);
  return Array.isArray(docs) && docs.length ? docs : [newDoc(WELCOME)];
}
export const saveDocs = docs => write('margin.docs', docs);

export const loadPrefs = () => ({ theme: 'auto', font: 'serif', size: 18, width: 68, view: 'write', sidebar: innerWidth > 700, ...read('margin.prefs', {}) });
export const savePrefs = prefs => write('margin.prefs', prefs);

export const loadLastId = () => read('margin.last', null);
export const saveLastId = id => write('margin.last', id);
