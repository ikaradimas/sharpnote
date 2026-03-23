import { describe, it, expect } from 'vitest';
import {
  formatLogTime,
  makeLibEditorId,
  isLibEditorId,
  isNotebookId,
  getNotebookDisplayName,
  extractHeadings,
  parseCsv,
  tableToCSV,
  formatFileSize,
  applyMath,
  getSectionHeadingLevel,
  getCollapsedSections,
  DOCS_TAB_ID,
  LIB_EDITOR_ID_PREFIX,
} from '../../src/renderer.jsx';

// ── formatLogTime ─────────────────────────────────────────────────────────────

describe('formatLogTime', () => {
  it('returns empty string for falsy input', () => {
    expect(formatLogTime(null)).toBe('');
    expect(formatLogTime(undefined)).toBe('');
    expect(formatLogTime('')).toBe('');
  });

  it('formats an ISO timestamp as HH:MM:SS.mmm', () => {
    // Use a fixed UTC time to avoid timezone sensitivity
    const ts = new Date(2026, 2, 18, 9, 5, 7, 42).toISOString(); // month is 0-indexed
    const result = formatLogTime(ts);
    // The output uses LOCAL time so just verify the pattern
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it('zero-pads all fields', () => {
    // Use a specific local time constructed to have single-digit h/m/s
    const d = new Date(2026, 0, 1, 1, 2, 3, 4); // 01:02:03.004 local
    const result = formatLogTime(d.toISOString());
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    const parts = result.split(':');
    expect(parts[0].length).toBe(2);
    expect(parts[1].length).toBe(2);
    const secMs = parts[2].split('.');
    expect(secMs[0].length).toBe(2);
    expect(secMs[1].length).toBe(3);
  });
});

// ── makeLibEditorId / isLibEditorId / isNotebookId ──────────────────────────

describe('makeLibEditorId', () => {
  it('prepends the lib-editor prefix', () => {
    expect(makeLibEditorId('/foo/bar.cs')).toBe(`${LIB_EDITOR_ID_PREFIX}/foo/bar.cs`);
  });
});

describe('isLibEditorId', () => {
  it('returns true for lib-editor IDs', () => {
    expect(isLibEditorId(makeLibEditorId('/any/path'))).toBe(true);
  });

  it('returns false for regular notebook IDs', () => {
    expect(isLibEditorId('abc-123')).toBe(false);
  });

  it('returns false for DOCS_TAB_ID', () => {
    expect(isLibEditorId(DOCS_TAB_ID)).toBe(false);
  });

  it('handles null/undefined without throwing', () => {
    expect(isLibEditorId(null)).toBe(false);
    expect(isLibEditorId(undefined)).toBe(false);
  });
});

describe('isNotebookId', () => {
  it('returns true for a plain UUID-style ID', () => {
    expect(isNotebookId('550e8400-e29b-41d4-a716')).toBe(true);
  });

  it('returns false for DOCS_TAB_ID', () => {
    expect(isNotebookId(DOCS_TAB_ID)).toBe(false);
  });

  it('returns false for lib-editor IDs', () => {
    expect(isNotebookId(makeLibEditorId('/path.cs'))).toBe(false);
  });

  it('returns false for null/empty', () => {
    expect(isNotebookId(null)).toBe(false);
    expect(isNotebookId('')).toBe(false);
  });
});

// ── getNotebookDisplayName ───────────────────────────────────────────────────

describe('getNotebookDisplayName', () => {
  it('prefers path over title', () => {
    expect(getNotebookDisplayName('/home/user/mybook.cnb', 'Title')).toBe('mybook');
  });

  it('strips .cnb extension from path', () => {
    expect(getNotebookDisplayName('/a/b/demo.cnb', null)).toBe('demo');
  });

  it('falls back to title when path is falsy', () => {
    expect(getNotebookDisplayName(null, 'My Title')).toBe('My Title');
  });

  it('falls back to fallback when both path and title are falsy', () => {
    expect(getNotebookDisplayName(null, null)).toBe('Untitled');
    expect(getNotebookDisplayName(null, '', 'New')).toBe('New');
  });

  it('handles Windows-style backslash paths', () => {
    expect(getNotebookDisplayName('C:\\Users\\demo\\file.cnb', null)).toBe('file');
  });
});

// ── extractHeadings ───────────────────────────────────────────────────────────

describe('extractHeadings', () => {
  const mkCell = (type, content, id = 'c1') => ({ id, type, content });

  it('extracts h1, h2, h3 headings from markdown cells', () => {
    const cells = [
      mkCell('markdown', '# Title\n## Section\n### Sub', 'a'),
    ];
    const result = extractHeadings(cells);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ level: 1, text: 'Title', cellId: 'a' });
    expect(result[1]).toEqual({ level: 2, text: 'Section', cellId: 'a' });
    expect(result[2]).toEqual({ level: 3, text: 'Sub', cellId: 'a' });
  });

  it('ignores code cells', () => {
    const cells = [mkCell('code', '# not a heading')];
    expect(extractHeadings(cells)).toHaveLength(0);
  });

  it('ignores h4+ headings', () => {
    const cells = [mkCell('markdown', '#### Deep')];
    expect(extractHeadings(cells)).toHaveLength(0);
  });

  it('returns empty array for no cells', () => {
    expect(extractHeadings([])).toHaveLength(0);
  });

  it('trims heading text', () => {
    const cells = [mkCell('markdown', '#  Spaced  ')];
    expect(extractHeadings(cells)[0].text).toBe('Spaced');
  });
});

// ── parseCsv / tableToCSV ────────────────────────────────────────────────────

describe('tableToCSV', () => {
  it('returns empty string for empty/null input', () => {
    expect(tableToCSV([])).toBe('');
    expect(tableToCSV(null)).toBe('');
  });

  it('produces header row + data rows', () => {
    const rows = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
    const csv = tableToCSV(rows);
    expect(csv).toBe('a,b\n1,2\n3,4');
  });

  it('quotes values containing commas', () => {
    const rows = [{ name: 'Smith, John', age: 30 }];
    expect(tableToCSV(rows)).toContain('"Smith, John"');
  });

  it('quotes values containing double quotes and escapes them', () => {
    const rows = [{ val: 'say "hi"' }];
    expect(tableToCSV(rows)).toContain('"say ""hi"""');
  });

  it('handles null values', () => {
    const rows = [{ a: null, b: 'ok' }];
    const csv = tableToCSV(rows);
    expect(csv).toBe('a,b\n,ok');
  });
});

describe('parseCsv', () => {
  it('parses header + data rows into objects', () => {
    const csv = 'name,age\nAlice,30\nBob,25';
    const result = parseCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'Alice', age: '30' });
    expect(result[1]).toEqual({ name: 'Bob', age: '25' });
  });

  it('returns empty array for header-only csv', () => {
    expect(parseCsv('name,age')).toHaveLength(0);
  });

  it('trims whitespace from headers', () => {
    const result = parseCsv(' a , b \nv1,v2');
    expect(Object.keys(result[0])).toContain('a');
    expect(Object.keys(result[0])).toContain('b');
  });
});

describe('parseCsv / tableToCSV round-trip', () => {
  it('round-trips simple data', () => {
    const original = [{ x: '1', y: '2' }, { x: '3', y: '4' }];
    const csv = tableToCSV(original);
    const parsed = parseCsv(csv);
    expect(parsed).toEqual(original);
  });
});

// ── formatFileSize ────────────────────────────────────────────────────────────

describe('formatFileSize', () => {
  it('formats bytes below 1 KB', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats exactly 1 KB', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('formats values in KB range', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(1024 * 512)).toBe('512.0 KB');
  });

  it('formats exactly 1 MB', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });

  it('formats values in MB range', () => {
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });
});

// ── getSectionHeadingLevel ────────────────────────────────────────────────────

describe('getSectionHeadingLevel', () => {
  const mk = (type, content) => ({ type, content });

  it('returns 1 for a # heading', () => {
    expect(getSectionHeadingLevel(mk('markdown', '# Title'))).toBe(1);
  });

  it('returns 2 for a ## heading', () => {
    expect(getSectionHeadingLevel(mk('markdown', '## Section'))).toBe(2);
  });

  it('returns 3 for a ### heading', () => {
    expect(getSectionHeadingLevel(mk('markdown', '### Sub'))).toBe(3);
  });

  it('returns null for h4+', () => {
    expect(getSectionHeadingLevel(mk('markdown', '#### Deep'))).toBeNull();
  });

  it('returns null for non-markdown cells', () => {
    expect(getSectionHeadingLevel(mk('code', '# comment'))).toBeNull();
  });

  it('returns null for plain text markdown cells', () => {
    expect(getSectionHeadingLevel(mk('markdown', 'just text'))).toBeNull();
  });

  it('ignores leading blank lines', () => {
    expect(getSectionHeadingLevel(mk('markdown', '\n\n## After blank'))).toBe(2);
  });

  it('returns null for empty content', () => {
    expect(getSectionHeadingLevel(mk('markdown', ''))).toBeNull();
  });

  it('requires a space after #', () => {
    expect(getSectionHeadingLevel(mk('markdown', '#NoSpace'))).toBeNull();
  });
});

// ── getCollapsedSections ──────────────────────────────────────────────────────

describe('getCollapsedSections', () => {
  const mk = (id, type, content, collapsed = false) => ({ id, type, content, collapsed });
  const md = (id, content, collapsed = false) => mk(id, 'markdown', content, collapsed);

  it('returns empty hidden set and counts map for no cells', () => {
    const { hidden, counts } = getCollapsedSections([]);
    expect(hidden.size).toBe(0);
    expect(counts.size).toBe(0);
  });

  it('hides cells under a collapsed heading', () => {
    const cells = [
      md('h1', '# Title', true),
      md('c1', 'paragraph'),
      mk('c2', 'code', 'console.log(1)'),
    ];
    const { hidden, counts } = getCollapsedSections(cells);
    expect(hidden.has('c1')).toBe(true);
    expect(hidden.has('c2')).toBe(true);
    expect(counts.get('h1')).toBe(2);
  });

  it('does not hide cells under an expanded heading', () => {
    const cells = [
      md('h1', '# Title', false),
      md('c1', 'paragraph'),
    ];
    const { hidden } = getCollapsedSections(cells);
    expect(hidden.size).toBe(0);
  });

  it('closes collapsed section at equal-level heading', () => {
    const cells = [
      md('h1', '## Section A', true),
      md('c1', 'body A'),
      md('h2', '## Section B', false),
      md('c2', 'body B'),
    ];
    const { hidden } = getCollapsedSections(cells);
    expect(hidden.has('c1')).toBe(true);
    expect(hidden.has('h2')).toBe(false);
    expect(hidden.has('c2')).toBe(false);
  });

  it('closes collapsed section at lower-level heading', () => {
    const cells = [
      md('sub', '## Sub', true),
      md('c1', 'under sub'),
      md('top', '# Top', false),
      md('c2', 'under top'),
    ];
    const { hidden } = getCollapsedSections(cells);
    expect(hidden.has('c1')).toBe(true);
    expect(hidden.has('top')).toBe(false);
    expect(hidden.has('c2')).toBe(false);
  });

  it('counts map has 0 for collapsed heading with no children', () => {
    const cells = [
      md('h1', '# Title', true),
      md('h2', '# Next', false),
    ];
    const { counts } = getCollapsedSections(cells);
    expect(counts.get('h1')).toBe(0);
  });

  it('handles nested collapsing correctly', () => {
    const cells = [
      md('h1', '# Parent', true),
      md('h2', '## Child', true),
      md('c1', 'deep content'),
    ];
    // h1 is collapsed so h2 and c1 are both hidden under h1
    const { hidden } = getCollapsedSections(cells);
    expect(hidden.has('h2')).toBe(true);
    expect(hidden.has('c1')).toBe(true);
  });
});

// ── applyMath ─────────────────────────────────────────────────────────────────

describe('applyMath', () => {
  it('returns non-math content unchanged', () => {
    expect(applyMath('hello world')).toBe('hello world');
  });

  it('renders inline math $...$ as KaTeX HTML', () => {
    const result = applyMath('value is $x + 1$.');
    expect(result).toContain('katex');
    expect(result).not.toContain('$x + 1$');
  });

  it('renders block math $$...$$ inside a math-block div', () => {
    const result = applyMath('$$E = mc^2$$');
    expect(result).toContain('class="math-block"');
    expect(result).toContain('katex');
  });

  it('does not process math inside fenced code blocks', () => {
    const result = applyMath('```\n$x + 1$\n```');
    expect(result).toBe('```\n$x + 1$\n```');
  });

  it('does not process math inside inline code', () => {
    const result = applyMath('use `$x$` for math');
    expect(result).toBe('use `$x$` for math');
  });

  it('does not confuse $$ with inline $ patterns', () => {
    const result = applyMath('$$a + b$$');
    // Should be rendered as block math, not two inline math segments
    expect(result).toContain('class="math-block"');
    // Should not contain raw $$
    expect(result).not.toContain('$$a');
  });

  it('handles multiple inline math expressions in one string', () => {
    const result = applyMath('$a$ and $b$');
    expect(result).not.toContain('$a$');
    expect(result).not.toContain('$b$');
    // Two katex spans
    const matches = result.match(/class="katex"/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('leaves content outside code blocks while preserving code blocks', () => {
    const result = applyMath('$x$ and `code $y$`');
    // inline math outside code should be rendered
    expect(result).not.toContain('$x$');
    // math inside inline code should be preserved literally
    expect(result).toContain('`code $y$`');
  });
});
