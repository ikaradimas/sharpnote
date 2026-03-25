import React, { useState, useEffect, useRef } from 'react';

export function FindBar({ cells, onClose, onHighlight }) {
  const [query, setQuery] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const matches = query.trim()
    ? cells.filter((c) => (c.content || '').toLowerCase().includes(query.toLowerCase()))
    : [];

  useEffect(() => {
    onHighlight(new Set(matches.map((c) => c.id)));
    setMatchIdx(0);
    if (matches.length > 0) scrollTo(0, matches);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  function scrollTo(idx, list) {
    const target = (list || matches)[idx];
    if (!target) return;
    const el = document.querySelector(`[data-cell-id="${target.id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function goNext() {
    const next = (matchIdx + 1) % Math.max(1, matches.length);
    setMatchIdx(next);
    scrollTo(next);
  }

  function goPrev() {
    const prev = (matchIdx - 1 + Math.max(1, matches.length)) % Math.max(1, matches.length);
    setMatchIdx(prev);
    scrollTo(prev);
  }

  return (
    <div className="find-bar">
      <input
        ref={inputRef}
        className="find-bar-input"
        type="text"
        placeholder="Find in notebook…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.shiftKey ? goPrev() : goNext();
          }
        }}
      />
      <span className="find-bar-count">
        {query.trim()
          ? matches.length > 0
            ? `${matchIdx + 1} / ${matches.length}`
            : 'No matches'
          : ''}
      </span>
      <button className="find-bar-btn" onClick={goPrev} disabled={matches.length === 0} title="Previous match (Shift+Enter)">↑</button>
      <button className="find-bar-btn" onClick={goNext} disabled={matches.length === 0} title="Next match (Enter)">↓</button>
      <button className="find-bar-close" onClick={onClose} title="Close (Escape)">✕</button>
    </div>
  );
}
