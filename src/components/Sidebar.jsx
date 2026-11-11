import { useState } from 'react';
import { titleOf } from '../lib/storage.js';

const day = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function Sidebar({ docs, currentId, onPick, onNew, onDelete }) {
  const [query, setQuery] = useState('');
  const q = query.toLowerCase();
  const shown = docs.filter(d => d.text.toLowerCase().includes(q)).sort((a, b) => b.updated - a.updated);

  return (
    <aside id="sidebar">
      <div className="side-head">
        <strong>Margin</strong>
        <button onClick={onNew} title="New document (Alt+N)">New</button>
      </div>
      <input id="filter" type="search" placeholder="Search documents" aria-label="Search documents" value={query} onChange={e => setQuery(e.target.value)} />
      <ul id="docs">
        {shown.map(d => (
          <li key={d.id} className={d.id === currentId ? 'on' : undefined}>
            <button className="pick" onClick={() => onPick(d.id)}>{titleOf(d)}<small>{day(d.updated)}</small></button>
            <button className="del" title="Delete" aria-label={`Delete ${titleOf(d)}`} onClick={() => onDelete(d)}>×</button>
          </li>
        ))}
      </ul>
      <a className="guide" href="docs/" target="_blank" rel="noopener">Guide</a>
    </aside>
  );
}
