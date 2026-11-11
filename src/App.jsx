import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Editor from './components/Editor.jsx';
import Sidebar from './components/Sidebar.jsx';
import { isTextFile, linkHandle, openFile, saveFile } from './lib/files.js';
import { md } from './lib/markdown.js';
import { loadDocs, loadLastId, loadPrefs, newDoc, saveDocs, saveLastId, savePrefs, titleOf } from './lib/storage.js';

const VIEWS = ['write', 'split', 'read'];
const fileName = doc => `${titleOf(doc).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'untitled'}.md`;

export default function App() {
  const [docs, setDocs] = useState(loadDocs);
  const [id, setId] = useState(loadLastId);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [focus, setFocus] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [note, setNote] = useState({ text: '' });
  const noteTimer = useRef(0);

  // Fall back to the most recent document if the chosen one is gone.
  const doc = docs.find(d => d.id === id) || docs.reduce((a, b) => (b.updated > a.updated ? b : a));
  const words = useMemo(() => (doc.text.match(/\S+/g) || []).length, [doc.text]);
  const showPreview = prefs.view !== 'write' || printing;
  const html = useMemo(() => (showPreview ? md(doc.text) : ''), [showPreview, doc.text]);

  function say(text, sticky) {
    clearTimeout(noteTimer.current);
    setNote({ text });
    if (text && !sticky) noteTimer.current = setTimeout(() => setNote({ text: '' }), 3000);
  }
  const setPref = (key, value) => setPrefs(p => ({ ...p, [key]: value }));
  const patch = change => setDocs(all => all.map(d => (d.id === doc.id ? { ...d, ...change } : d)));

  function addDoc(text = '', extra) {
    const created = newDoc(text, extra);
    setDocs(all => [...all, created]);
    setId(created.id);
    return created;
  }
  function removeDoc(target) {
    if (!confirm(`Delete "${titleOf(target)}"? This cannot be undone.`)) return;
    setDocs(all => (all.length > 1 ? all.filter(d => d.id !== target.id) : [newDoc()]));
  }

  async function open() {
    try {
      const file = await openFile();
      if (!file) return;
      linkHandle(addDoc(file.text, { file: file.name, path: file.path }).id, file.handle);
    } catch (err) {
      say(`Could not open: ${err.message}`);
    }
  }
  async function save() {
    try {
      const saved = await saveFile(doc, fileName(doc));
      if (!saved) return;
      patch({ file: saved.name, path: saved.path });
      say(saved.downloaded ? `Downloaded ${saved.name}` : `Saved to ${saved.name}`);
    } catch (err) {
      say(`Could not save: ${err.message}`);
    }
  }

  const cycleView = () => setPref('view', VIEWS[(VIEWS.indexOf(prefs.view) + 1) % VIEWS.length]);
  const toggleSidebar = () => setPref('sidebar', !prefs.sidebar);

  // Persist. Typing is debounced so a long document is not rewritten on every key.
  useEffect(() => {
    const t = setTimeout(() => { if (!saveDocs(docs)) say('Storage is full. Save this document to a file.', true); }, 300);
    return () => clearTimeout(t);
  }, [docs]);
  useEffect(() => { saveLastId(doc.id); }, [doc.id]);
  useEffect(() => {
    savePrefs(prefs);
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.font = prefs.font;
    root.style.setProperty('--size', `${prefs.size}px`);
    root.style.setProperty('--width', prefs.width);
  }, [prefs]);
  useEffect(() => { document.title = `${titleOf(doc)} · Margin`; }, [doc]);

  // Window-level behaviour. The handlers live in a ref so the listeners are attached once.
  const live = useRef({});
  live.current = { open, save, addDoc, cycleView, toggleSidebar, focus };
  useEffect(() => {
    const onKey = e => {
      const a = live.current, mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      const alt = e.altKey && !mod && { KeyN: () => a.addDoc(), KeyP: a.cycleView, KeyF: () => setFocus(f => !f), KeyL: a.toggleSidebar }[e.code];
      if (mod && key === 's') { e.preventDefault(); a.save(); }
      else if (mod && key === 'o') { e.preventDefault(); a.open(); }
      else if (alt) { e.preventDefault(); alt(); }
      else if (key === 'escape' && a.focus) setFocus(false);
    };
    const onDrop = async e => {
      e.preventDefault();
      for (const file of e.dataTransfer.files) if (isTextFile(file)) live.current.addDoc(await file.text(), { file: file.name });
    };
    const stop = e => e.preventDefault();
    const onStorage = e => { if (e.key === 'margin.docs') setDocs(loadDocs()); };   // another tab saved
    const beforePrint = () => flushSync(() => setPrinting(true));
    const afterPrint = () => setPrinting(false);
    const events = [['keydown', onKey], ['drop', onDrop], ['dragover', stop], ['storage', onStorage], ['beforeprint', beforePrint], ['afterprint', afterPrint]];
    for (const [name, fn] of events) addEventListener(name, fn);
    return () => { for (const [name, fn] of events) removeEventListener(name, fn); };
  }, []);

  const status = note.text || (focus ? 'Esc leaves focus mode' : doc.file ? `${doc.file} · autosaved here` : 'Autosaved on this device');
  const classes = [!prefs.sidebar && 'no-side', focus && 'focus'].filter(Boolean).join(' ');

  return (
    <div id="app" className={classes} data-view={prefs.view}>
      <Sidebar
        docs={docs} currentId={doc.id} onNew={() => addDoc()} onDelete={removeDoc}
        onPick={picked => { setId(picked); if (innerWidth <= 700) setPref('sidebar', false); }}
      />
      <main>
        <header id="bar">
          <button onClick={toggleSidebar} title="Document list (Alt+L)" aria-label="Toggle document list">&#9776;</button>
          <span className="grow" />
          <button onClick={open} title="Open a file (Ctrl+O)">Open</button>
          <button onClick={save} title="Save to a file (Ctrl+S)">Save</button>
          <button onClick={cycleView} title="Switch view (Alt+P)">{prefs.view[0].toUpperCase() + prefs.view.slice(1)}</button>
          <button onClick={() => setFocus(true)} title="Focus mode (Alt+F)">Focus</button>
          <details id="settings">
            <summary title="Appearance">Aa</summary>
            <div className="menu">
              <label>Theme
                <select value={prefs.theme} onChange={e => setPref('theme', e.target.value)}>
                  <option value="auto">Match system</option><option value="light">Light</option><option value="dark">Dark</option>
                </select>
              </label>
              <label>Typeface
                <select value={prefs.font} onChange={e => setPref('font', e.target.value)}>
                  <option value="serif">Serif</option><option value="sans">Sans</option><option value="mono">Mono</option>
                </select>
              </label>
              <label>Text size <input type="range" min="14" max="26" value={prefs.size} onChange={e => setPref('size', +e.target.value)} /></label>
              <label>Line width <input type="range" min="45" max="110" value={prefs.width} onChange={e => setPref('width', +e.target.value)} /></label>
            </div>
          </details>
        </header>

        <div id="panes">
          <Editor doc={doc} onChange={text => patch({ text, updated: Date.now() })} onCursor={setCursor} />
          <article id="preview" dangerouslySetInnerHTML={{ __html: html }} />
        </div>

        <footer id="status">
          <span>{words} {words === 1 ? 'word' : 'words'} · {Math.max(1, Math.round(words / 230))} min read</span>
          <span id="pos">Ln {cursor.line}, Col {cursor.col}</span>
          <span className="grow" />
          <span>{status}</span>
        </footer>
      </main>
    </div>
  );
}
