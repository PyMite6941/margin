import { useEffect, useRef, useState } from 'react';
import Accounts from './Accounts.jsx';
import { MODES } from '../lib/modes.js';
import { TRASH_DAYS } from '../lib/storage.js';

// The settings panel, opened from the gear at the foot of the sidebar (or Ctrl+,).
// Every change applies immediately and is remembered on this device.

const TABS = ['Appearance', 'Editor', 'Documents', 'AI', 'Backup', 'Keys'];

export const KEYS = [
  ['Ctrl S', 'Save to a file'], ['Ctrl O', 'Open a file'], ['Ctrl F', 'Find and replace'],
  ['Ctrl Shift H', 'Version history'], ['Ctrl J', 'Ask AI (once an account is added)'], ['Ctrl ,', 'Settings'], ['Ctrl P', 'Print or save as PDF'],
  ['Ctrl B / I', 'Bold or italic (Markdown)'], ['Ctrl Shift X', 'Strikethrough (Markdown)'], ['Ctrl K', 'Insert a link'],
  ['Ctrl Alt 1-6', 'Heading level (Markdown); Ctrl Alt 0 for normal text'],
  ['Ctrl Shift 7 / 8 / 9', 'Numbered, bulleted or check list (Markdown)'], ['Shift Alt F', 'Tidy HTML'],
  ['Tab / Shift Tab', 'Indent or outdent lines'], ['Enter', 'Continue a list'],
  ['Alt N', 'New document'], ['Alt O', 'Show or hide the outline'], ['Alt P', 'Switch view'], ['Alt F', 'Focus mode (Esc leaves)'], ['Alt L', 'Show or hide the document list'],
];

const Toggle = ({ label, hint, checked, onChange }) => (
  <label className="toggle">
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
    <span>{label}{hint && <small>{hint}</small>}</span>
  </label>
);

const Choice = ({ label, value, options, onChange }) => (
  <label>{label}
    <select value={value} onChange={e => onChange(e.target.value)}>
      {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select>
  </label>
);

const Slider = ({ label, value, min, max, step = 1, unit = '', onChange }) => (
  <label><span className="lab">{label}<output>{value}{unit}</output></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} />
  </label>
);

const kb = bytes => (bytes < 1024 ? `${bytes} bytes` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`);

export default function Settings({ open, onClose, prefs, setPref, onReset, accounts, onTestAI, backup }) {
  const ref = useRef(null);
  const [tab, setTab] = useState('Appearance');
  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const set = key => value => setPref(key, value);

  return (
    <dialog id="settings" className="sheet" ref={ref} onClose={onClose} onClick={e => { if (e.target === ref.current) onClose(); }} aria-label="Settings">
      <header>
        <strong>Settings</strong>
        <button onClick={onClose} aria-label="Close settings" title="Close (Esc)">×</button>
      </header>
      <div className="settings-body">
        <nav role="tablist" aria-label="Settings sections">
          {TABS.map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : undefined} onClick={() => setTab(t)}>{t}</button>)}
        </nav>

        <div className="settings-page" role="tabpanel">
          {tab === 'Appearance' && <section>
            <Choice label="Theme" value={prefs.theme} onChange={set('theme')} options={[['auto', 'Match system'], ['light', 'Light'], ['dark', 'Dark']]} />
            <Choice label="Typeface" value={prefs.font} onChange={set('font')} options={[['serif', 'Serif'], ['sans', 'Sans'], ['mono', 'Mono']]} />
            <Slider label="Text size" value={prefs.size} min={12} max={28} unit="px" onChange={set('size')} />
            <Slider label="Line width" value={prefs.width} min={40} max={120} unit=" characters" onChange={set('width')} />
            <Slider label="Line spacing" value={prefs.leading} min={1.2} max={2.2} step={0.05} onChange={set('leading')} />
          </section>}

          {tab === 'Editor' && <section>
            <Toggle label="Check spelling" checked={prefs.spell} onChange={set('spell')} />
            <Toggle label="Wrap long lines" hint="Off scrolls sideways instead, handy for code and HTML" checked={prefs.wrap} onChange={set('wrap')} />
            <Toggle label="Continue lists on Enter" checked={prefs.lists} onChange={set('lists')} />
            <Toggle label="Close brackets, quotes and HTML tags" hint="Typing ( adds ), and <p> adds </p> in HTML documents" checked={prefs.pairs} onChange={set('pairs')} />
            <Choice label="Tab key inserts" value={prefs.indent} onChange={set('indent')} options={[['2', '2 spaces'], ['4', '4 spaces'], ['tab', 'A tab']]} />
          </section>}

          {tab === 'Documents' && <section>
            <Choice label="New documents start as" value={prefs.newMode} onChange={set('newMode')} options={Object.entries(MODES).map(([k, m]) => [k, m.label])} />
            <Choice label="Sort the document list by" value={prefs.sort} onChange={set('sort')} options={[['updated', 'Last edited'], ['created', 'Newest first'], ['title', 'Title']]} />
            <Toggle label="Ask before moving a document to the trash" hint={`Deleted documents wait in the trash for ${TRASH_DAYS} days, and the status bar offers Undo.`} checked={prefs.confirmTrash} onChange={set('confirmTrash')} />
            <Toggle
              label="Keep saved files up to date"
              hint="After you save or open a file, your edits are written back to it as you type. Works in the desktop apps, Chrome and Edge."
              checked={prefs.autoWrite} onChange={set('autoWrite')}
            />
          </section>}

          {tab === 'AI' && <section>
            <Accounts ring={accounts} onTest={onTestAI} />
          </section>}

          {tab === 'Backup' && <section>
            <p className="hint">{backup.count} {backup.count === 1 ? 'document' : 'documents'}, {kb(backup.bytes)}, stored in this {window.desktop ? 'app' : 'browser'} only. Clearing site data or a private window loses them, so keep a backup.</p>
            <div className="row">
              <button className="btn" onClick={backup.onExport}>Export all documents</button>
              <button className="btn" onClick={backup.onImport}>Import a backup</button>
            </div>
            <p className="hint">A backup is one <code>.json</code> file holding every document. Importing adds its documents and skips ones you already have.</p>
            <p className="hint">Version history uses {kb(backup.historyBytes)}. Older unnamed versions are thinned out on their own when space runs short.</p>
            <div className="row danger">
              <button className="btn" onClick={backup.onClearHistory}>Clear version history…</button>
              <button className="btn" onClick={backup.onDeleteAll}>Delete all documents…</button>
            </div>
          </section>}

          {tab === 'Keys' && <section>
            <table className="keys"><tbody>
              {KEYS.map(([k, what]) => <tr key={k}><td>{k.split(' ').map((p, i) => (p === '/' ? ' / ' : <kbd key={i}>{p}</kbd>))}</td><td>{what}</td></tr>)}
            </tbody></table>
            <p className="hint">On a Mac, use Cmd for Ctrl and Option for Alt.</p>
          </section>}
        </div>
      </div>
      <footer>
        <button className="link" onClick={onReset}>Reset appearance, editor and document settings</button>
      </footer>
    </dialog>
  );
}
