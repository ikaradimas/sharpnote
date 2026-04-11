import React, { useState, useMemo } from 'react';
import { CHANGELOG } from '../../config/changelog.js';

function Gears({ count }) {
  return <span className="cl-gears" title={`Complexity: ${count}/3`}>{'⚙'.repeat(count)}</span>;
}

export function ChangelogPanel() {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!query) return CHANGELOG;
    return CHANGELOG.filter(e =>
      e.title.toLowerCase().includes(query) ||
      e.version.includes(query) ||
      e.items.some(i => i.toLowerCase().includes(query))
    );
  }, [query]);

  return (
    <div className="changelog-panel">
      <div className="changelog-sidebar">
        <div className="changelog-search-wrap">
          <input
            className="changelog-search"
            placeholder="Search changelog..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            spellCheck={false}
          />
          {search && (
            <button className="changelog-search-clear" onClick={() => setSearch('')}>x</button>
          )}
        </div>
        <div className="changelog-index">
          {CHANGELOG.map((entry) => {
            const matches = !query || entry.title.toLowerCase().includes(query) ||
              entry.version.includes(query) || entry.items.some(i => i.toLowerCase().includes(query));
            return (
              <a
                key={entry.version}
                href={`#cl-${entry.version}`}
                className={`changelog-index-item${!matches ? ' changelog-index-dim' : ''}${entry.gears >= 3 ? ' changelog-index-major' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(`cl-${entry.version}`)?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <span className="cl-idx-version">{entry.version}</span>
                <Gears count={entry.gears} />
              </a>
            );
          })}
        </div>
      </div>
      <div className="changelog-content">
        {filtered.length === 0 && (
          <div className="changelog-empty">No entries matching "{search}"</div>
        )}
        {filtered.map((entry) => (
          <div
            key={entry.version}
            id={`cl-${entry.version}`}
            className={`changelog-entry${entry.gears >= 3 ? ' changelog-entry-major' : ''}`}
          >
            <div className="changelog-entry-header">
              <span className="cl-version">{entry.version}</span>
              <Gears count={entry.gears} />
              <span className="cl-date">{entry.date}</span>
            </div>
            <div className="cl-title">{entry.title}</div>
            <ul className="cl-items">
              {entry.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
