import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);
const tmpDir = path.join(os.tmpdir(), `sharpnote-history-test-${Date.now()}`);

let history;

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  history = require('../../src/main/notebook-history.js');
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function makeData(title, cellCount) {
  return {
    title,
    cells: Array.from({ length: cellCount }, (_, i) => ({
      id: `cell${i}`,
      type: 'code',
      content: `Console.WriteLine("Cell ${i}");`,
    })),
    config: [{ key: 'a', value: '1' }],
  };
}

describe('notebook-history — saveSnapshot and loadHistory', () => {
  it('creates a history file on first save', () => {
    const nbPath = path.join(tmpDir, 'test1.cnb');
    history.saveSnapshot(nbPath, makeData('Test 1', 2));
    const hp = nbPath + '.history';
    expect(fs.existsSync(hp)).toBe(true);
    const loaded = history.loadHistory(nbPath);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe('Test 1');
    expect(loaded[0].cellCount).toBe(2);
    expect(loaded[0].configCount).toBe(1);
  });

  it('appends multiple snapshots', () => {
    const nbPath = path.join(tmpDir, 'test2.cnb');
    history.saveSnapshot(nbPath, makeData('Snap 1', 1));
    history.saveSnapshot(nbPath, makeData('Snap 2', 3));
    history.saveSnapshot(nbPath, makeData('Snap 3', 5));
    const loaded = history.loadHistory(nbPath);
    expect(loaded).toHaveLength(3);
    expect(loaded[2].title).toBe('Snap 3');
    expect(loaded[2].cellCount).toBe(5);
  });

  it('stores cell summary with preview', () => {
    const nbPath = path.join(tmpDir, 'test3.cnb');
    history.saveSnapshot(nbPath, makeData('Preview Test', 2));
    const loaded = history.loadHistory(nbPath);
    expect(loaded[0].cellSummary).toHaveLength(2);
    expect(loaded[0].cellSummary[0].id).toBe('cell0');
    expect(loaded[0].cellSummary[0].type).toBe('code');
    expect(loaded[0].cellSummary[0].preview).toContain('Console');
  });
});

describe('notebook-history — restoreSnapshot', () => {
  it('restores the correct snapshot by index', () => {
    const nbPath = path.join(tmpDir, 'test-restore.cnb');
    history.saveSnapshot(nbPath, makeData('First', 1));
    history.saveSnapshot(nbPath, makeData('Second', 2));
    const restored = history.restoreSnapshot(nbPath, 0);
    expect(restored.title).toBe('First');
    expect(restored.cells).toHaveLength(1);
  });

  it('returns null for out-of-bounds index', () => {
    const nbPath = path.join(tmpDir, 'test-oob.cnb');
    history.saveSnapshot(nbPath, makeData('Only', 1));
    expect(history.restoreSnapshot(nbPath, 5)).toBeNull();
    expect(history.restoreSnapshot(nbPath, -1)).toBeNull();
  });
});

describe('notebook-history — FIFO eviction', () => {
  it('evicts oldest snapshots when exceeding MAX_SNAPSHOTS', () => {
    const nbPath = path.join(tmpDir, 'test-eviction.cnb');
    for (let i = 0; i < history.MAX_SNAPSHOTS + 10; i++) {
      history.saveSnapshot(nbPath, makeData(`Snap ${i}`, i));
    }
    const loaded = history.loadHistory(nbPath);
    expect(loaded).toHaveLength(history.MAX_SNAPSHOTS);
    // Oldest should have been evicted; first remaining should be snap 10
    expect(loaded[0].title).toBe('Snap 10');
    expect(loaded[loaded.length - 1].title).toBe(`Snap ${history.MAX_SNAPSHOTS + 9}`);
  });
});

describe('notebook-history — missing/invalid history', () => {
  it('returns empty array for missing history file', () => {
    const nbPath = path.join(tmpDir, 'nonexistent.cnb');
    expect(history.loadHistory(nbPath)).toEqual([]);
  });

  it('returns empty array for corrupt history file', () => {
    const nbPath = path.join(tmpDir, 'corrupt.cnb');
    fs.writeFileSync(nbPath + '.history', 'not-json!', 'utf-8');
    expect(history.loadHistory(nbPath)).toEqual([]);
  });
});

describe('notebook-history — deleteHistory', () => {
  it('removes the history file', () => {
    const nbPath = path.join(tmpDir, 'test-delete.cnb');
    history.saveSnapshot(nbPath, makeData('Delete me', 1));
    expect(fs.existsSync(nbPath + '.history')).toBe(true);
    history.deleteHistory(nbPath);
    expect(fs.existsSync(nbPath + '.history')).toBe(false);
  });

  it('does not throw for missing history file', () => {
    const nbPath = path.join(tmpDir, 'no-such-file.cnb');
    expect(() => history.deleteHistory(nbPath)).not.toThrow();
  });
});
