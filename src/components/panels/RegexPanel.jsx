import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── Flag definitions ───────────────────────────────────────────────────────────

const FLAGS = [
  { key: 'g', title: 'Global — find all matches, not just the first' },
  { key: 'i', title: 'Ignore case — match regardless of uppercase/lowercase' },
  { key: 'm', title: 'Multiline — ^ and $ match start/end of each line' },
  { key: 's', title: 'Dot-all — . matches newline characters too' },
  { key: 'u', title: 'Unicode — enables \\u{HHHH} escapes and full Unicode matching' },
];

// ── Quick reference ────────────────────────────────────────────────────────────

const QUICK_REF = [
  { token: '.',         desc: 'Any char (except newline)' },
  { token: '\\d',       desc: 'Digit [0-9]' },
  { token: '\\w',       desc: 'Word char [a-zA-Z0-9_]' },
  { token: '\\s',       desc: 'Whitespace' },
  { token: '\\D \\W \\S', desc: 'Negated shorthands' },
  { token: '^ $',       desc: 'String start / end' },
  { token: '\\b',       desc: 'Word boundary' },
  { token: 'a|b',       desc: 'Alternation (a or b)' },
  { token: '[abc]',     desc: 'Character class' },
  { token: '[^abc]',    desc: 'Negated class' },
  { token: 'a?',        desc: 'Zero or one' },
  { token: 'a*',        desc: 'Zero or more' },
  { token: 'a+',        desc: 'One or more' },
  { token: 'a{2,4}',   desc: 'Between 2 and 4' },
  { token: '(abc)',     desc: 'Capture group' },
  { token: '(?:abc)',   desc: 'Non-capture group' },
  { token: '(?<n>abc)', desc: 'Named capture group' },
  { token: '(?=abc)',   desc: 'Lookahead' },
  { token: '(?!abc)',   desc: 'Negative lookahead' },
  { token: '(?<=abc)',  desc: 'Lookbehind' },
  { token: '(?<!abc)',  desc: 'Negative lookbehind' },
  { token: 'a*? a+?',  desc: 'Lazy (non-greedy) quantifiers' },
];

// ── Pattern tokenizer for syntax colouring ────────────────────────────────────

export function tokenizePattern(pattern) {
  const tokens = [];
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];

    // Escape sequence
    if (c === '\\' && i + 1 < pattern.length) {
      tokens.push({ type: 'escape', text: pattern.slice(i, i + 2) });
      i += 2;
      continue;
    }

    // Character class [...]
    if (c === '[') {
      let j = i + 1;
      if (j < pattern.length && pattern[j] === '^') j++;
      if (j < pattern.length && pattern[j] === ']') j++;
      while (j < pattern.length && pattern[j] !== ']') {
        if (pattern[j] === '\\') j++;
        j++;
      }
      tokens.push({ type: 'charclass', text: pattern.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    // Group openers — detect special syntax prefix
    if (c === '(') {
      const rest = pattern.slice(i);
      let prefix;
      if (/^\(\?<=/.test(rest))       prefix = '(?<=';
      else if (/^\(\?<!/.test(rest))  prefix = '(?<!';
      else if (/^\(\?<\w/.test(rest)) {
        const m = rest.match(/^\(\?<(\w+)>/);
        prefix = m ? `(?<${m[1]}>` : '(?<';
      }
      else if (/^\(\?:/.test(rest))   prefix = '(?:';
      else if (/^\(\?=/.test(rest))   prefix = '(?=';
      else if (/^\(\?!/.test(rest))   prefix = '(?!';
      else                            prefix = '(';
      tokens.push({ type: 'group', text: prefix });
      i += prefix.length;
      continue;
    }

    // Group closer
    if (c === ')') {
      tokens.push({ type: 'group', text: ')' });
      i++;
      continue;
    }

    // Curly-brace quantifier {n,m}
    if (c === '{') {
      let j = i + 1;
      while (j < pattern.length && pattern[j] !== '}') j++;
      let text = pattern.slice(i, j + 1);
      if (j + 1 < pattern.length && pattern[j + 1] === '?') { text += '?'; j++; }
      tokens.push({ type: 'quantifier', text });
      i = j + 1;
      continue;
    }

    // Single-char quantifiers
    if ('*+?'.includes(c)) {
      let text = c;
      if (i + 1 < pattern.length && pattern[i + 1] === '?') { text += '?'; i++; }
      tokens.push({ type: 'quantifier', text });
      i++;
      continue;
    }

    if (c === '^' || c === '$') { tokens.push({ type: 'anchor',      text: c }); i++; continue; }
    if (c === '.')               { tokens.push({ type: 'dot',         text: c }); i++; continue; }
    if (c === '|')               { tokens.push({ type: 'alternation', text: c }); i++; continue; }

    tokens.push({ type: 'literal', text: c });
    i++;
  }
  return tokens;
}

// ── Match extraction ───────────────────────────────────────────────────────────

function extractMatch(m) {
  const groups = [];
  for (let idx = 1; idx < m.length; idx++) {
    groups.push({ index: idx, value: m[idx], name: null });
  }
  if (m.groups) {
    for (const [name, val] of Object.entries(m.groups)) {
      const g = groups.find(g => g.value === val && g.name === null);
      if (g) g.name = name;
    }
  }
  return {
    full:   m[0],
    start:  m.index,
    end:    m.index + m[0].length,
    groups: groups.filter(g => g.value !== undefined),
  };
}

// ── Backdrop segment builder ───────────────────────────────────────────────────

export function buildSegments(testStr, matches) {
  if (!matches.length || !testStr) return [{ type: 'text', text: testStr }];
  const segs = [];
  let pos = 0;
  for (let mi = 0; mi < matches.length; mi++) {
    const { start, end, full } = matches[mi];
    if (start > pos)  segs.push({ type: 'text',  text: testStr.slice(pos, start) });
    if (end > start)  segs.push({ type: 'match', text: full, colorIdx: mi % 4 });
    pos = end;
  }
  if (pos < testStr.length) segs.push({ type: 'text', text: testStr.slice(pos) });
  return segs;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function RegexPanel() {
  const [pattern, setPattern] = useState('');
  const [flags,   setFlags]   = useState({ g: true, i: false, m: false, s: false, u: false });
  const [testStr, setTestStr] = useState('');
  const [error,   setError]   = useState(null);
  const [matches, setMatches] = useState([]);
  const [refOpen, setRefOpen] = useState(false);
  const [replacement, setReplacement] = useState('');
  const backdropRef = useRef(null);
  const textareaRef = useRef(null);

  // Recompute matches whenever pattern, flags, or test string changes
  useEffect(() => {
    if (!pattern) { setError(null); setMatches([]); return; }
    const flagStr = Object.entries(flags).filter(([, v]) => v).map(([k]) => k).join('');
    try {
      const re = new RegExp(pattern, flagStr);
      const ms = [];
      if (flags.g) {
        let m, lastIndex = -1;
        re.lastIndex = 0;
        while ((m = re.exec(testStr)) !== null && ms.length < 1000) {
          ms.push(extractMatch(m));
          if (re.lastIndex === lastIndex) re.lastIndex++; // prevent infinite loop on zero-width match
          lastIndex = re.lastIndex;
        }
      } else {
        const m = re.exec(testStr);
        if (m) ms.push(extractMatch(m));
      }
      setError(null);
      setMatches(ms);
    } catch (e) {
      setError(e.message);
      setMatches([]);
    }
  }, [pattern, flags, testStr]);

  // Keep backdrop scroll in sync with textarea
  const syncScroll = useCallback(() => {
    const bd = backdropRef.current;
    const ta = textareaRef.current;
    if (bd && ta) { bd.scrollTop = ta.scrollTop; bd.scrollLeft = ta.scrollLeft; }
  }, []);

  const toggleFlag = (key) => setFlags(f => ({ ...f, [key]: !f[key] }));

  const tokens   = pattern ? tokenizePattern(pattern) : [];
  const segments = buildSegments(testStr, matches);

  const matchLabel =
    error         ? 'invalid pattern' :
    !pattern      ? '' :
    matches.length === 0 ? 'no matches' :
    matches.length === 1 ? '1 match'    : `${matches.length} matches`;

  return (
    <div className="regex-panel">

      {/* ── Pattern input + flags ─────────────────────────────────────────── */}
      <div className="regex-panel-header">
        <div className="rx-pattern-row">
          <div className={`rx-pattern-wrap${error ? ' rx-input-error' : ''}`}>
            <span className="rx-slash" aria-hidden="true">/</span>
            <input
              className="rx-pattern-input"
              value={pattern}
              onChange={e => setPattern(e.target.value)}
              placeholder="pattern"
              spellCheck={false}
              aria-label="Regex pattern"
            />
            <span className="rx-slash" aria-hidden="true">/</span>
          </div>
          <div className="rx-flags" role="group" aria-label="Regex flags">
            {FLAGS.map(f => (
              <button
                key={f.key}
                className={`rx-flag${flags[f.key] ? ' active' : ''}`}
                onClick={() => toggleFlag(f.key)}
                title={f.title}
                aria-pressed={flags[f.key]}
              >
                {f.key}
              </button>
            ))}
          </div>
        </div>

        {/* Syntax breakdown or error */}
        {error ? (
          <div className="rx-error-msg" role="alert">{error}</div>
        ) : tokens.length > 0 && (
          <div className="rx-tokens" aria-label="Pattern breakdown">
            {tokens.map((tok, i) => (
              <span key={i} className={`rx-token rx-token-${tok.type}`}>{tok.text}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Test string with highlight overlay ───────────────────────────── */}
      <div className="rx-test-section">
        <div className="rx-section-header">
          <span className="rx-section-label">Test String</span>
          <span className={`rx-match-count${matches.length > 0 ? ' has-matches' : ''}${error ? ' has-error' : ''}`}>
            {matchLabel}
          </span>
        </div>
        <div className="rx-test-wrap">
          <div className="rx-backdrop" ref={backdropRef} aria-hidden="true">
            {segments.map((seg, i) =>
              seg.type === 'text'
                ? <span key={i}>{seg.text}</span>
                : <mark key={i} className={`rx-match rx-match-${seg.colorIdx}`}>{seg.text}</mark>
            )}
            {'\n'}
          </div>
          {!testStr && (
            <div className="rx-test-placeholder">Paste text to test against…</div>
          )}
          <textarea
            ref={textareaRef}
            className="rx-textarea"
            value={testStr}
            onChange={e => setTestStr(e.target.value)}
            onScroll={syncScroll}
            spellCheck={false}
            aria-label="Test string"
          />
        </div>
      </div>

      {/* ── Replace input ──────────────────────────────────────────────── */}
      <div className="rx-replace-row">
        <div className="rx-replace-label">Replace With</div>
        <input
          className="rx-replace-input"
          value={replacement}
          onChange={e => setReplacement(e.target.value)}
          placeholder="replacement (supports $1, $&, etc.)"
          spellCheck={false}
          aria-label="Replacement string"
        />
      </div>

      {/* ── Replace preview ──────────────────────────────────────────────── */}
      {replacement && pattern && !error && testStr && (
        <div className="rx-replace-preview">
          {(() => {
            try {
              const flagStr = Object.entries(flags).filter(([, v]) => v).map(([k]) => k).join('');
              const re = new RegExp(pattern, flagStr);
              return testStr.replace(re, replacement);
            } catch { return '(invalid replacement)'; }
          })()}
        </div>
      )}

      {/* ── Matches list ──────────────────────────────────────────────────── */}
      <div className="rx-matches-section">
        {matches.length > 0 && (
          <>
            <div className="rx-section-label" style={{ marginBottom: 5 }}>Matches</div>
            {matches.map((m, mi) => (
              <div key={mi} className="rx-match-item">
                <div className="rx-match-header">
                  <span className={`rx-match-badge rx-badge-${mi % 4}`}>{mi}</span>
                  <span className="rx-match-text">"{m.full}"</span>
                  <span className="rx-match-pos">{m.start}–{m.end}</span>
                </div>
                {m.groups.length > 0 && (
                  <div className="rx-groups">
                    {m.groups.map(g => (
                      <div key={g.index} className="rx-group">
                        <span className={`rx-group-label${g.name ? ' rx-group-named' : ''}`}>{g.name ?? `$${g.index}`}</span>
                        <span className="rx-group-val">"{g.value}"</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Quick reference (collapsible) ─────────────────────────────────── */}
      <div className="rx-ref-section">
        <button className="rx-ref-toggle" onClick={() => setRefOpen(o => !o)}>
          <span className="rx-ref-chevron">{refOpen ? '▾' : '▸'}</span>
          Quick Reference
        </button>
        {refOpen && (
          <div className="rx-ref-content">
            {QUICK_REF.map(r => (
              <div key={r.token} className="rx-ref-item">
                <span className="rx-ref-token">{r.token}</span>
                <span className="rx-ref-desc">{r.desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
