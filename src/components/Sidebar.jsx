import { useState } from 'react';
import { TRASH_DAYS, titleOf } from '../lib/storage.js';

const day = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const daysLeft = t => Math.max(1, Math.ceil(TRASH_DAYS - (Date.now() - t) / 864e5));

const ORDER = {
  updated: (a, b) => b.updated - a.updated,
  created: (a, b) => (b.created || b.updated) - (a.created || a.updated),
  title: (a, b) => titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: 'base', numeric: true }),
};

// Pinned documents stay at the top. Deleted ones go to the trash, shown in place of the list.
export default function Sidebar({ docs, trash, sort, currentId, onPick, onNew, onDelete, onPin, onRestore, onPurge, onSettings }) {
  const [query, setQuery] = useState('');
  const [inTrash, setInTrash] = useState(false);
  const q = query.toLowerCase();
  const by = ORDER[sort] || ORDER.updated;
  const shown = (inTrash ? trash : docs).filter(d => d.text.toLowerCase().includes(q))
    .sort(inTrash ? (a, b) => b.trashed - a.trashed : (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || by(a, b));
  const showTrash = inTrash && trash.length;

  return (
    <aside id="sidebar">
      <div className="side-head">
        {showTrash ? <strong>Trash</strong> : <strong>Margin</strong>}
        {showTrash
          ? <button onClick={() => setInTrash(false)} title="Back to documents">Done</button>
          : <button onClick={onNew} title="New document (Alt+N)">New</button>}
      </div>
      <input id="filter" type="search" placeholder={showTrash ? 'Search the trash' : 'Search documents'} aria-label="Search documents" value={query} onChange={e => setQuery(e.target.value)} />
      {showTrash ? (
        <ul id="docs" className="trash">
          {shown.map(d => (
            <li key={d.id}>
              <span className="pick">{titleOf(d)}<small>Deleted {day(d.trashed)} · gone in {daysLeft(d.trashed)} days</small></span>
              <button className="act" title="Put back" aria-label={`Restore ${titleOf(d)}`} onClick={() => onRestore(d.id)}>↺</button>
              <button className="act" title="Delete forever" aria-label={`Delete ${titleOf(d)} forever`} onClick={() => onPurge([d.id])}>×</button>
            </li>
          ))}
          <li><button className="link empty" onClick={() => { if (confirm(`Delete all ${trash.length} documents in the trash forever?`)) { onPurge(trash.map(d => d.id)); setInTrash(false); } }}>Empty the trash</button></li>
        </ul>
      ) : (
        <ul id="docs">
          {shown.map(d => (
            <li key={d.id} className={[d.id === currentId && 'on', d.pinned && 'pinned'].filter(Boolean).join(' ') || undefined}>
              <button className="pick" onClick={() => onPick(d.id)}>{titleOf(d)}<small>{d.pinned && <span className="pin-mark">Pinned · </span>}{day(d.updated)}</small></button>
              <button className="act pin" title={d.pinned ? 'Unpin' : 'Pin to the top'} aria-pressed={Boolean(d.pinned)} aria-label={`${d.pinned ? 'Unpin' : 'Pin'} ${titleOf(d)}`} onClick={() => onPin(d)}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill={d.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" /></svg>
              </button>
              <button className="act" title="Move to trash" aria-label={`Delete ${titleOf(d)}`} onClick={() => onDelete(d)}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="side-foot">
        <a className="guide" href="docs/" target="_blank" rel="noopener">Guide</a>
        {trash.length > 0 && !showTrash && <button className="trash-link" onClick={() => setInTrash(true)} title="Deleted documents, kept for 30 days">Trash ({trash.length})</button>}
        <span className="grow" />
        <button className="gear" onClick={onSettings} title="Settings (Ctrl+,)" aria-label="Settings">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
