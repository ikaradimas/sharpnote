import { describe, it, expect } from 'vitest';
import { parseDiff } from '../../src/utils/diff-parser.js';

// ── Empty / null input ───────────────────────────────────────────────────────

describe('parseDiff – empty / null input', () => {
  it('returns empty array for null', () => {
    expect(parseDiff(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseDiff(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseDiff('')).toEqual([]);
  });
});

// ── Single hunk ──────────────────────────────────────────────────────────────

describe('parseDiff – single hunk', () => {
  const diff = [
    'diff --git a/file.txt b/file.txt',
    'index abc1234..def5678 100644',
    '--- a/file.txt',
    '+++ b/file.txt',
    '@@ -1,3 +1,4 @@',
    ' line one',
    '-old line',
    '+new line',
    '+added line',
    ' line three',
  ].join('\n');

  it('returns one hunk', () => {
    const hunks = parseDiff(diff);
    expect(hunks).toHaveLength(1);
  });

  it('parses hunk header numbers', () => {
    const [hunk] = parseDiff(diff);
    expect(hunk.oldStart).toBe(1);
    expect(hunk.oldCount).toBe(3);
    expect(hunk.newStart).toBe(1);
    expect(hunk.newCount).toBe(4);
  });

  it('parses add/del/ctx lines', () => {
    const [hunk] = parseDiff(diff);
    const types = hunk.lines.map((l) => l.type);
    expect(types).toEqual(['ctx', 'del', 'add', 'add', 'ctx']);
  });

  it('add lines have null oldLine', () => {
    const [hunk] = parseDiff(diff);
    const adds = hunk.lines.filter((l) => l.type === 'add');
    for (const a of adds) {
      expect(a.oldLine).toBeNull();
    }
  });

  it('del lines have null newLine', () => {
    const [hunk] = parseDiff(diff);
    const dels = hunk.lines.filter((l) => l.type === 'del');
    for (const d of dels) {
      expect(d.newLine).toBeNull();
    }
  });

  it('context lines have both oldLine and newLine', () => {
    const [hunk] = parseDiff(diff);
    const ctxs = hunk.lines.filter((l) => l.type === 'ctx');
    for (const c of ctxs) {
      expect(c.oldLine).not.toBeNull();
      expect(c.newLine).not.toBeNull();
    }
  });
});

// ── Line number tracking ─────────────────────────────────────────────────────

describe('parseDiff – line numbers', () => {
  const diff = [
    '@@ -10,4 +20,5 @@',
    ' ctx',
    '-removed',
    '+added1',
    '+added2',
    ' ctx2',
  ].join('\n');

  it('tracks old line numbers correctly', () => {
    const [hunk] = parseDiff(diff);
    const oldLines = hunk.lines.map((l) => l.oldLine);
    // ctx=10, del=11, add=null, add=null, ctx=12
    expect(oldLines).toEqual([10, 11, null, null, 12]);
  });

  it('tracks new line numbers correctly', () => {
    const [hunk] = parseDiff(diff);
    const newLines = hunk.lines.map((l) => l.newLine);
    // ctx=20, del=null, add=21, add=22, ctx=23
    expect(newLines).toEqual([20, null, 21, 22, 23]);
  });
});

// ── Multiple hunks ───────────────────────────────────────────────────────────

describe('parseDiff – multiple hunks', () => {
  const diff = [
    '@@ -1,2 +1,2 @@',
    '-old',
    '+new',
    ' same',
    '@@ -50,3 +50,4 @@',
    ' ctx',
    '+inserted',
    ' ctx',
    ' ctx',
  ].join('\n');

  it('returns two hunks', () => {
    expect(parseDiff(diff)).toHaveLength(2);
  });

  it('second hunk has correct header values', () => {
    const hunks = parseDiff(diff);
    expect(hunks[1].oldStart).toBe(50);
    expect(hunks[1].newStart).toBe(50);
    expect(hunks[1].newCount).toBe(4);
  });
});

// ── Optional count in hunk header ────────────────────────────────────────────

describe('parseDiff – optional count', () => {
  const diff = '@@ -1 +1,3 @@\n+a\n+b\n+c';

  it('defaults missing old count to 1', () => {
    const [hunk] = parseDiff(diff);
    expect(hunk.oldCount).toBe(1);
  });

  it('parses explicit new count', () => {
    const [hunk] = parseDiff(diff);
    expect(hunk.newCount).toBe(3);
  });
});

// ── Ignores lines before first hunk ──────────────────────────────────────────

describe('parseDiff – file headers ignored', () => {
  const diff = [
    'diff --git a/f.txt b/f.txt',
    'index 1234567..abcdefg 100644',
    '--- a/f.txt',
    '+++ b/f.txt',
    '@@ -1,1 +1,1 @@',
    '-old',
    '+new',
  ].join('\n');

  it('only produces lines from inside the hunk', () => {
    const hunks = parseDiff(diff);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines).toHaveLength(2);
  });
});
