import { useEffect, useMemo, useRef, useState } from 'react';
import { changeSize, diff } from '../lib/diff.js';

// Version history for one document. The list shows the current text and every snapshot,
// newest first; the page shows what changed in the chosen version since the one before it.
// Restoring goes through the editor, so Ctrl+Z still undoes it.

const when = t => {
  const d = new Date(t), today = new Date().toDateString() === d.toDateString();
  return today ? `Today, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric', hour: 'numeric', minute: '2-digit' });
};
const wordCount = text => (text.match(/\S+/g) || []).length;

export default function History({ open, onClose, doc, versions, onRestore, onCopy, onName }) {
  const ref = useRef(null);
  const [pick, setPick] = useState('now');
  const [changes, setChanges] = useState(true);
  const [name, setName] = useState('');
  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) { setPick('now'); d.showModal(); }
    if (!open && d.open) d.close();
  }, [open]);

  const list = useMemo(() => [{ t: 'now', text: doc.text, name: 'Current version' }, ...[...versions].reverse()], [doc.text, versions]);
  const k = Math.max(0, list.findIndex(v => v.t === pick)), chosen = list[k], before = list[k + 1]?.text ?? '';
  const parts = useMemo(() => (open && changes ? diff(before, chosen.text) : null), [open, changes, before, chosen.text]);
  const size = parts && changeSize(parts);
  useEffect(() => setName(chosen.t === 'now' ? '' : chosen.name || ''), [chosen.t, chosen.name]);
  const saveName = () => { if (name.trim() !== (chosen.t === 'now' ? '' : chosen.name || '')) onName(chosen.t, name.trim()); };

  return (
    <dialog id="history" className="sheet" ref={ref} onClose={onClose} onClick={e => { if (e.target === ref.current) onClose(); }} aria-label="Version history">
      <header>
        <strong>Version history</strong>
        <button onClick={onClose} aria-label="Close version history" title="Close (Esc)">×</button>
      </header>
      <div className="settings-body">
        <nav aria-label="Versions">
          {list.map(v => (
            <button key={v.t} className={v.t === chosen.t ? 'on' : undefined} aria-current={v.t === chosen.t} onClick={() => setPick(v.t)}>
              {v.t === 'now' ? <b>Current version</b> : <>{v.name && <b>{v.name}</b>}<span>{when(v.t)}</span></>}
              <small>{wordCount(v.text)} words</small>
            </button>
          ))}
          {!versions.length && <p className="hint">Earlier versions appear here as you write: one when you open a document, then every few minutes while you edit.</p>}
        </nav>
        <div className="settings-page version">
          <div className="row tools">
            {chosen.t !== 'now' && <button className="btn" onClick={() => onRestore(chosen.text)}>Restore this version</button>}
            <button className="btn" onClick={() => onCopy(chosen.text, chosen.t === 'now' ? null : when(chosen.t))}>Open as a copy</button>
            <input
              placeholder={chosen.t === 'now' ? 'Name the current version' : 'Name this version'} aria-label="Version name" value={name}
              onChange={e => setName(e.target.value)} onBlur={saveName} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveName(); } }}
            />
          </div>
          <div className="row">
            <button className="opt" aria-pressed={changes} onClick={() => setChanges(c => !c)}>{changes ? 'Showing changes' : 'Show changes'}</button>
            <span className="hint">{size ? (list[k + 1] ? `Since the version before: ${size.added} words added, ${size.removed} removed.` : 'The oldest version kept, shown as all new.') : 'The text of this version.'}</span>
          </div>
          <pre className="diff">{parts ? parts.map(([op, text], i) => (op === '+' ? <ins key={i}>{text}</ins> : op === '-' ? <del key={i}>{text}</del> : text)) : chosen.text}</pre>
        </div>
      </div>
    </dialog>
  );
}
