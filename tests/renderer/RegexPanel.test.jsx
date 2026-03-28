import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RegexPanel } from '../../src/components/panels/RegexPanel.jsx';
import { tokenizePattern, buildSegments } from '../../src/components/panels/RegexPanel.jsx';

// ── tokenizePattern ────────────────────────────────────────────────────────────

describe('tokenizePattern', () => {
  it('classifies anchors', () => {
    const tokens = tokenizePattern('^hello$');
    expect(tokens[0]).toMatchObject({ type: 'anchor',  text: '^' });
    expect(tokens[tokens.length - 1]).toMatchObject({ type: 'anchor', text: '$' });
  });

  it('classifies quantifiers', () => {
    const tokens = tokenizePattern('a*b+c?');
    expect(tokens.find(t => t.text === '*')).toMatchObject({ type: 'quantifier' });
    expect(tokens.find(t => t.text === '+')).toMatchObject({ type: 'quantifier' });
    expect(tokens.find(t => t.text === '?')).toMatchObject({ type: 'quantifier' });
  });

  it('classifies lazy quantifier', () => {
    const tokens = tokenizePattern('a*?');
    expect(tokens.find(t => t.text === '*?')).toMatchObject({ type: 'quantifier' });
  });

  it('classifies curly-brace quantifier', () => {
    const tokens = tokenizePattern('a{2,4}');
    expect(tokens.find(t => t.text === '{2,4}')).toMatchObject({ type: 'quantifier' });
  });

  it('classifies escape sequences', () => {
    const tokens = tokenizePattern('\\d\\w\\s');
    expect(tokens).toHaveLength(3);
    expect(tokens.every(t => t.type === 'escape')).toBe(true);
  });

  it('classifies character class', () => {
    const tokens = tokenizePattern('[a-z]');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type: 'charclass', text: '[a-z]' });
  });

  it('classifies negated character class', () => {
    const tokens = tokenizePattern('[^abc]');
    expect(tokens[0]).toMatchObject({ type: 'charclass', text: '[^abc]' });
  });

  it('classifies group opener', () => {
    const tokens = tokenizePattern('(abc)');
    expect(tokens[0]).toMatchObject({ type: 'group', text: '(' });
    expect(tokens[tokens.length - 1]).toMatchObject({ type: 'group', text: ')' });
  });

  it('classifies non-capture group prefix', () => {
    const tokens = tokenizePattern('(?:abc)');
    expect(tokens[0]).toMatchObject({ type: 'group', text: '(?:' });
  });

  it('classifies lookahead prefix', () => {
    const tokens = tokenizePattern('(?=foo)');
    expect(tokens[0]).toMatchObject({ type: 'group', text: '(?=' });
  });

  it('classifies negative lookahead prefix', () => {
    const tokens = tokenizePattern('(?!foo)');
    expect(tokens[0]).toMatchObject({ type: 'group', text: '(?!' });
  });

  it('classifies named group prefix', () => {
    const tokens = tokenizePattern('(?<year>\\d{4})');
    expect(tokens[0]).toMatchObject({ type: 'group', text: '(?<year>' });
  });

  it('classifies alternation', () => {
    const tokens = tokenizePattern('a|b');
    expect(tokens.find(t => t.text === '|')).toMatchObject({ type: 'alternation' });
  });

  it('classifies dot', () => {
    const tokens = tokenizePattern('a.b');
    expect(tokens.find(t => t.text === '.')).toMatchObject({ type: 'dot' });
  });

  it('classifies literals', () => {
    const tokens = tokenizePattern('abc');
    expect(tokens).toHaveLength(3);
    expect(tokens.every(t => t.type === 'literal')).toBe(true);
  });
});

// ── buildSegments ──────────────────────────────────────────────────────────────

describe('buildSegments', () => {
  it('returns single text segment when no matches', () => {
    const segs = buildSegments('hello world', []);
    expect(segs).toEqual([{ type: 'text', text: 'hello world' }]);
  });

  it('returns single text segment for empty string', () => {
    const segs = buildSegments('', []);
    expect(segs).toEqual([{ type: 'text', text: '' }]);
  });

  it('wraps a match at the start', () => {
    const matches = [{ full: 'hello', start: 0, end: 5 }];
    const segs = buildSegments('hello world', matches);
    expect(segs[0]).toMatchObject({ type: 'match', text: 'hello', colorIdx: 0 });
    expect(segs[1]).toMatchObject({ type: 'text',  text: ' world' });
  });

  it('wraps a match in the middle', () => {
    const matches = [{ full: 'world', start: 6, end: 11 }];
    const segs = buildSegments('hello world', matches);
    expect(segs[0]).toMatchObject({ type: 'text',  text: 'hello ' });
    expect(segs[1]).toMatchObject({ type: 'match', text: 'world', colorIdx: 0 });
  });

  it('cycles colour index across multiple matches', () => {
    const matches = [
      { full: 'a', start: 0, end: 1 },
      { full: 'b', start: 2, end: 3 },
      { full: 'c', start: 4, end: 5 },
      { full: 'd', start: 6, end: 7 },
      { full: 'e', start: 8, end: 9 },
    ];
    const segs = buildSegments('a b c d e', matches).filter(s => s.type === 'match');
    expect(segs.map(s => s.colorIdx)).toEqual([0, 1, 2, 3, 0]);
  });
});

// ── RegexPanel component ───────────────────────────────────────────────────────

describe('RegexPanel', () => {
  it('renders pattern input and flags', () => {
    render(<RegexPanel />);
    expect(screen.getByRole('textbox', { name: /pattern/i })).toBeInTheDocument();
    for (const flag of ['g', 'i', 'm', 's', 'u']) {
      expect(screen.getByRole('button', { name: flag })).toBeInTheDocument();
    }
  });

  it('renders test string textarea', () => {
    render(<RegexPanel />);
    expect(screen.getByRole('textbox', { name: /test string/i })).toBeInTheDocument();
  });

  it('shows no match count when pattern is empty', () => {
    render(<RegexPanel />);
    expect(screen.queryByText(/match/i)).not.toBeInTheDocument();
  });

  it('shows error for invalid pattern', () => {
    render(<RegexPanel />);
    fireEvent.change(screen.getByRole('textbox', { name: /pattern/i }), {
      target: { value: '(unclosed' },
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows "no matches" when pattern does not match', () => {
    render(<RegexPanel />);
    fireEvent.change(screen.getByRole('textbox', { name: /pattern/i }), {
      target: { value: 'xyz' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /test string/i }), {
      target: { value: 'hello world' },
    });
    expect(screen.getByText('no matches')).toBeInTheDocument();
  });

  it('shows match count when pattern matches', () => {
    render(<RegexPanel />);
    fireEvent.change(screen.getByRole('textbox', { name: /pattern/i }), {
      target: { value: '\\w+' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /test string/i }), {
      target: { value: 'hello world' },
    });
    expect(screen.getByText('2 matches')).toBeInTheDocument();
  });

  it('shows "1 match" in singular form', () => {
    render(<RegexPanel />);
    fireEvent.change(screen.getByRole('textbox', { name: /pattern/i }), {
      target: { value: 'hello' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /test string/i }), {
      target: { value: 'say hello there' },
    });
    expect(screen.getByText('1 match')).toBeInTheDocument();
  });

  it('shows match positions in the match list', () => {
    render(<RegexPanel />);
    fireEvent.change(screen.getByRole('textbox', { name: /pattern/i }), {
      target: { value: 'hello' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /test string/i }), {
      target: { value: 'hello world' },
    });
    expect(screen.getByText('0–5')).toBeInTheDocument();
  });

  it('shows capture group values in the match list', () => {
    render(<RegexPanel />);
    fireEvent.change(screen.getByRole('textbox', { name: /pattern/i }), {
      target: { value: '(\\w+)\\s(\\w+)' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /test string/i }), {
      target: { value: 'hello world' },
    });
    expect(screen.getByText('"hello"')).toBeInTheDocument();
    expect(screen.getByText('"world"')).toBeInTheDocument();
  });

  it('shows named capture groups', () => {
    render(<RegexPanel />);
    fireEvent.change(screen.getByRole('textbox', { name: /pattern/i }), {
      target: { value: '(?<first>\\w+)' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /test string/i }), {
      target: { value: 'hello' },
    });
    expect(screen.getByText('first')).toBeInTheDocument();
  });

  it('toggles a flag off and on', () => {
    render(<RegexPanel />);
    const gBtn = screen.getByRole('button', { name: /^g$/i });
    expect(gBtn).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(gBtn);
    expect(gBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(gBtn);
    expect(gBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('turning off g flag stops after first match', () => {
    render(<RegexPanel />);
    // Turn off global flag
    fireEvent.click(screen.getByRole('button', { name: /^g$/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /pattern/i }), {
      target: { value: '\\w+' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /test string/i }), {
      target: { value: 'hello world' },
    });
    expect(screen.getByText('1 match')).toBeInTheDocument();
  });

  it('shows and hides the quick reference', () => {
    render(<RegexPanel />);
    expect(screen.queryByText('Any char (except newline)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Quick Reference'));
    expect(screen.getByText('Any char (except newline)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Quick Reference'));
    expect(screen.queryByText('Any char (except newline)')).not.toBeInTheDocument();
  });

  it('shows syntax-coloured token breakdown for valid pattern', () => {
    render(<RegexPanel />);
    fireEvent.change(screen.getByRole('textbox', { name: /pattern/i }), {
      target: { value: '^\\d+$' },
    });
    const breakdown = screen.getByLabelText('Pattern breakdown');
    expect(breakdown).toBeInTheDocument();
  });
});
