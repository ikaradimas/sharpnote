import React, { useState, useMemo, useCallback } from 'react';

function parseConflicts(text) {
  const sections = [];
  const lines = (text || '').split('\n');
  let current = { type: 'normal', lines: [] };
  let inConflict = false, inTheirs = false;

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      if (current.lines.length) sections.push(current);
      current = { type: 'conflict', ours: [], theirs: [], resolved: null };
      inConflict = true; inTheirs = false;
    } else if (line.startsWith('=======') && inConflict) {
      inTheirs = true;
    } else if (line.startsWith('>>>>>>>') && inConflict) {
      sections.push(current);
      current = { type: 'normal', lines: [] };
      inConflict = false; inTheirs = false;
    } else if (inConflict) {
      if (inTheirs) current.theirs.push(line);
      else current.ours.push(line);
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines?.length || current.ours?.length) sections.push(current);
  return sections;
}

export { parseConflicts };

export function MergeConflictView({ diffText, onResolve }) {
  const sections = useMemo(() => parseConflicts(diffText), [diffText]);
  const [resolutions, setResolutions] = useState({});
  const [copied, setCopied] = useState(false);

  const resolve = useCallback((idx, choice) => {
    setResolutions(prev => ({ ...prev, [idx]: choice }));
  }, []);

  const getResolved = useCallback(() => {
    return sections.map((s, i) => {
      if (s.type === 'normal') return s.lines.join('\n');
      const choice = resolutions[i];
      if (choice === 'ours') return s.ours.join('\n');
      if (choice === 'theirs') return s.theirs.join('\n');
      if (choice === 'both') return [...s.ours, ...s.theirs].join('\n');
      return [...s.ours, ...s.theirs].join('\n');
    }).join('\n');
  }, [sections, resolutions]);

  const allResolved = sections.every((s, i) => s.type === 'normal' || resolutions[i]);

  const handleCopy = () => {
    const text = getResolved();
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = () => {
    if (onResolve) onResolve(getResolved());
  };

  const conflictCount = sections.filter(s => s.type === 'conflict').length;

  return (
    <div className="merge-conflict-view">
      <div className="merge-conflict-summary">
        {conflictCount} conflict{conflictCount !== 1 ? 's' : ''} found
        {allResolved && ' — all resolved'}
      </div>

      {sections.map((section, i) => {
        if (section.type === 'normal') {
          return (
            <div key={i} className="merge-section">
              <div className="merge-normal">{section.lines.join('\n')}</div>
            </div>
          );
        }

        const choice = resolutions[i];
        return (
          <div key={i} className="merge-section">
            <div className="merge-conflict-block">
              <div className="merge-conflict-header">
                <button
                  className={`merge-accept-btn${choice === 'ours' ? ' active' : ''}`}
                  onClick={() => resolve(i, 'ours')}
                >Accept Ours</button>
                <button
                  className={`merge-accept-btn${choice === 'theirs' ? ' active' : ''}`}
                  onClick={() => resolve(i, 'theirs')}
                >Accept Theirs</button>
                <button
                  className={`merge-accept-btn${choice === 'both' ? ' active' : ''}`}
                  onClick={() => resolve(i, 'both')}
                >Accept Both</button>
              </div>

              {choice ? (
                <div className="merge-resolved">
                  {choice === 'ours' ? section.ours.join('\n')
                    : choice === 'theirs' ? section.theirs.join('\n')
                    : [...section.ours, ...section.theirs].join('\n')}
                </div>
              ) : (
                <>
                  <div className="merge-ours">{section.ours.join('\n')}</div>
                  <div className="merge-theirs">{section.theirs.join('\n')}</div>
                </>
              )}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="merge-copy-btn" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy Resolved'}
        </button>
        {onResolve && (
          <button className="merge-copy-btn" onClick={handleSave} disabled={!allResolved}>
            Save Resolved
          </button>
        )}
      </div>
    </div>
  );
}
