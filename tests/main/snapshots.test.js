import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);
const tmpDir = path.join(os.tmpdir(), `sharpnote-snap-test-${Date.now()}`);
let snapshots;

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  snapshots = require('../../src/main/snapshots');
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('snapshots.normalize', () => {
  it('strips id, handleId, and other transient fields', () => {
    const normalized = snapshots.normalize([
      { type: 'stdout', id: 'cell-123', content: 'hi' },
      { type: 'display', id: 'cell-123', handleId: 'h1', format: 'html', content: '<b>ok</b>' },
    ]);
    expect(normalized).toEqual([
      { type: 'stdout', content: 'hi' },
      { type: 'display', format: 'html', content: '<b>ok</b>' },
    ]);
  });

  it('keeps error message and stackTrace', () => {
    const normalized = snapshots.normalize([
      { type: 'error', id: 'c', message: 'boom', stackTrace: 'at foo()' },
    ]);
    expect(normalized).toEqual([{ type: 'error', message: 'boom', stackTrace: 'at foo()' }]);
  });
});

describe('snapshots.compare', () => {
  it('matches equivalent outputs regardless of property order', () => {
    const a = [{ format: 'html', content: 'x', type: 'display' }];
    const b = [{ type: 'display', content: 'x', format: 'html' }];
    expect(snapshots.compare(a, b).match).toBe(true);
  });

  it('reports mismatch when content differs', () => {
    const a = [{ type: 'stdout', content: 'a' }];
    const b = [{ type: 'stdout', content: 'b' }];
    expect(snapshots.compare(a, b).match).toBe(false);
  });
});

describe('snapshots persistence', () => {
  const notebookPath = path.join(tmpDir, 'demo.cnb');
  fs.writeFileSync = fs.writeFileSync; // sanity

  it('saveSnapshot then loadSnapshot round-trips', () => {
    fs.writeFileSync(notebookPath, '{}'); // placeholder so dirname exists
    const ok = snapshots.saveSnapshot(notebookPath, 'cell-1', [
      { type: 'stdout', id: 'cell-1', content: '42' },
    ]);
    expect(ok).toBe(true);

    const loaded = snapshots.loadSnapshot(notebookPath, 'cell-1');
    expect(loaded).toEqual([{ type: 'stdout', content: '42' }]);
  });

  it('captureOrCompare captures on first run, compares thereafter', () => {
    const cellId = 'cell-2';
    const first = snapshots.captureOrCompare(notebookPath, cellId, [
      { type: 'stdout', content: 'x' },
    ]);
    expect(first).toEqual({ match: true, captured: true });

    const second = snapshots.captureOrCompare(notebookPath, cellId, [
      { type: 'stdout', content: 'x' },
    ]);
    expect(second.match).toBe(true);
    expect(second.captured).toBe(false);

    const drift = snapshots.captureOrCompare(notebookPath, cellId, [
      { type: 'stdout', content: 'y' },
    ]);
    expect(drift.match).toBe(false);
  });

  it('deleteSnapshot removes the file', () => {
    snapshots.saveSnapshot(notebookPath, 'cell-3', [{ type: 'stdout', content: 'gone' }]);
    expect(snapshots.loadSnapshot(notebookPath, 'cell-3')).not.toBeNull();
    snapshots.deleteSnapshot(notebookPath, 'cell-3');
    expect(snapshots.loadSnapshot(notebookPath, 'cell-3')).toBeNull();
  });

  it('captureOrCompare reports an error when notebookPath is missing', () => {
    const res = snapshots.captureOrCompare(null, 'x', []);
    expect(res.match).toBe(false);
    expect(res.error).toBe('no-notebook-path');
  });
});
