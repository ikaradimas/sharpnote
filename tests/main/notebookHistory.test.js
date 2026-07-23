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
  it('creates a history file on first save', async () => {
    const nbPath = path.join(tmpDir, 'test1.cnb');
    await history.saveSnapshot(nbPath, makeData('Test 1', 2));
    const hp = nbPath + '.history';
    expect(fs.existsSync(hp)).toBe(true);
    const loaded = history.loadHistory(nbPath);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe('Test 1');
    expect(loaded[0].cellCount).toBe(2);
    expect(loaded[0].configCount).toBe(1);
  });

  it('appends multiple snapshots', async () => {
    const nbPath = path.join(tmpDir, 'test2.cnb');
    await history.saveSnapshot(nbPath, makeData('Snap 1', 1));
    await history.saveSnapshot(nbPath, makeData('Snap 2', 3));
    await history.saveSnapshot(nbPath, makeData('Snap 3', 5));
    const loaded = history.loadHistory(nbPath);
    expect(loaded).toHaveLength(3);
    expect(loaded[2].title).toBe('Snap 3');
    expect(loaded[2].cellCount).toBe(5);
  });

  it('stores cell summary with preview', async () => {
    const nbPath = path.join(tmpDir, 'test3.cnb');
    await history.saveSnapshot(nbPath, makeData('Preview Test', 2));
    const loaded = history.loadHistory(nbPath);
    expect(loaded[0].cellSummary).toHaveLength(2);
    expect(loaded[0].cellSummary[0].id).toBe('cell0');
    expect(loaded[0].cellSummary[0].type).toBe('code');
    expect(loaded[0].cellSummary[0].preview).toContain('Console');
  });
});

describe('notebook-history — excludes large blobs (329MB-freeze regression)', () => {
  it('does not duplicate embeddedFiles/retainedResults into snapshots', async () => {
    const nbPath = path.join(tmpDir, 'test-embedded.cnb');
    const big = 'x'.repeat(2 * 1024 * 1024); // 2 MB blob
    const data = {
      ...makeData('Embedded', 2),
      embeddedFiles: [{ name: 'big.csv', content: big }],
      retainedResults: { r: big },
    };
    // Ten saves. Pre-fix this grew the history toward ~40 MB (10 × 2 MB × 2 blobs);
    // the same pattern with 50 snapshots × 6.6 MB was the real 329 MB file.
    for (let i = 0; i < 10; i++) await history.saveSnapshot(nbPath, data);

    const size = fs.statSync(nbPath + '.history').size;
    expect(size).toBeLessThan(1024 * 1024); // stays well under 1 MB despite the 2 MB blobs

    const loaded = history.loadHistory(nbPath);
    expect(loaded).toHaveLength(10);
    for (const snap of loaded) {
      expect(snap.data.embeddedFiles).toBeUndefined();
      expect(snap.data.retainedResults).toBeUndefined();
      // cells/config/title (what restore actually uses) are preserved
      expect(snap.data.cells).toHaveLength(2);
      expect(snap.data.title).toBe('Embedded');
      expect(snap.data.config).toHaveLength(1);
    }
  });
});

describe('notebook-history — self-heals an oversized history file', () => {
  it('ignores a history file larger than the cap, then replaces it on next save', async () => {
    const nbPath = path.join(tmpDir, 'test-oversized.cnb');
    const hp = nbPath + '.history';
    // Simulate a pre-fix bloated file (bigger than the 25 MB cap).
    fs.writeFileSync(hp, 'x'.repeat(26 * 1024 * 1024), 'utf-8');
    expect(history.loadHistory(nbPath)).toEqual([]); // ignored, not parsed

    await history.saveSnapshot(nbPath, makeData('Fresh', 1));
    expect(fs.statSync(hp).size).toBeLessThan(1024 * 1024); // shrunk to a healthy file
    const loaded = history.loadHistory(nbPath);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe('Fresh');
  });
});

describe('notebook-history — restoreSnapshot', () => {
  it('restores the correct snapshot by index', async () => {
    const nbPath = path.join(tmpDir, 'test-restore.cnb');
    await history.saveSnapshot(nbPath, makeData('First', 1));
    await history.saveSnapshot(nbPath, makeData('Second', 2));
    const restored = history.restoreSnapshot(nbPath, 0);
    expect(restored.title).toBe('First');
    expect(restored.cells).toHaveLength(1);
  });

  it('returns null for out-of-bounds index', async () => {
    const nbPath = path.join(tmpDir, 'test-oob.cnb');
    await history.saveSnapshot(nbPath, makeData('Only', 1));
    expect(history.restoreSnapshot(nbPath, 5)).toBeNull();
    expect(history.restoreSnapshot(nbPath, -1)).toBeNull();
  });
});

describe('notebook-history — FIFO eviction', () => {
  it('evicts oldest snapshots when exceeding MAX_SNAPSHOTS', async () => {
    const nbPath = path.join(tmpDir, 'test-eviction.cnb');
    for (let i = 0; i < history.MAX_SNAPSHOTS + 10; i++) {
      await history.saveSnapshot(nbPath, makeData(`Snap ${i}`, i));
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
  it('removes the history file', async () => {
    const nbPath = path.join(tmpDir, 'test-delete.cnb');
    await history.saveSnapshot(nbPath, makeData('Delete me', 1));
    expect(fs.existsSync(nbPath + '.history')).toBe(true);
    history.deleteHistory(nbPath);
    expect(fs.existsSync(nbPath + '.history')).toBe(false);
  });

  it('does not throw for missing history file', () => {
    const nbPath = path.join(tmpDir, 'no-such-file.cnb');
    expect(() => history.deleteHistory(nbPath)).not.toThrow();
  });
});
