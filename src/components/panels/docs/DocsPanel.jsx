import React, { useState, useRef } from 'react';
import { DOCS_SECTIONS } from '../../../config/docs-sections.js';

function hiText(text, query) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="docs-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function DocBlock({ block, query }) {
  if (block.type === 'p')
    return <p className="docs-p">{hiText(block.text, query)}</p>;
  if (block.type === 'h3')
    return <h3 className="docs-h3">{hiText(block.text, query)}</h3>;
  if (block.type === 'ul')
    return <ul className="docs-ul">{block.items.map((item, i) => <li key={i}>{hiText(item, query)}</li>)}</ul>;
  if (block.type === 'code')
    return <pre className="docs-code"><code>{block.text}</code></pre>;
  if (block.type === 'shortcuts')
    return (
      <table className="docs-shortcuts">
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i}>
              <td className="docs-shortcut-keys"><kbd>{row.keys}</kbd></td>
              <td className="docs-shortcut-desc">{hiText(row.desc, query)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  if (block.type === 'img')
    return (
      <figure className="docs-figure">
        <img className="docs-img" src={block.src} alt={block.alt || ''} />
        {block.caption && <figcaption className="docs-caption">{block.caption}</figcaption>}
      </figure>
    );
  return null;
}

function sectionMatchesQuery(section, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const flat = [
    section.title,
    ...section.content.map((b) => {
      if (b.text) return b.text;
      if (b.items) return b.items.join(' ');
      if (b.rows) return b.rows.map((r) => r.keys + ' ' + r.desc).join(' ');
      return '';
    }),
  ].join(' ').toLowerCase();
  return flat.includes(q);
}

export function DocsPanel() {
  const [query, setQuery] = useState('');
  const sectionRefs = useRef({});
  const filtered = DOCS_SECTIONS.filter((s) => sectionMatchesQuery(s, query));

  const scrollTo = (id) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="docs-panel">
      <nav className="docs-sidebar">
        <div className="docs-search-wrap">
          <input
            className="docs-search"
            placeholder="Search docs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="docs-search-clear" onClick={() => setQuery('')}>×</button>
          )}
        </div>
        <div className="docs-index">
          {DOCS_SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`docs-index-item${filtered.some((f) => f.id === s.id) ? '' : ' docs-index-dim'}`}
              onClick={() => scrollTo(s.id)}
            >
              {s.title}
            </button>
          ))}
        </div>
      </nav>
      <div className="docs-content">
        {filtered.map((section) => (
          <section
            key={section.id}
            className="docs-section"
            ref={(el) => { sectionRefs.current[section.id] = el; }}
          >
            <h2 className="docs-section-title">{section.title}</h2>
            {section.content.map((block, i) => (
              <DocBlock key={i} block={block} query={query} />
            ))}
          </section>
        ))}
        {filtered.length === 0 && (
          <div className="docs-no-results">No results for "{query}"</div>
        )}
      </div>
    </div>
  );
}
