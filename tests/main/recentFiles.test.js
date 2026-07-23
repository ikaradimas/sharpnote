import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Use the real filesystem against a throwaway temp dir — matching logOps.test.js.
// vi.mock('fs') does not intercept require('fs') in these CommonJS main-process
// modules, so a mock here would be decorative (and, before the guard below, the
// unguarded save actually wrote recent-files.json into the repo root on every run).

let addRecentFile, getRecentFiles, clearRecentFiles, loadRecentFiles;
let tmpDir;

beforeAll(async () => {
  process.env.VITEST = '1';
  const rf = await import('../../src/main/recent-files.js');
  addRecentFile    = rf.addRecentFile;
  getRecentFiles   = rf.getRecentFiles;
  clearRecentFiles = rf.clearRecentFiles;
  loadRecentFiles  = rf.loadRecentFiles;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sharpnote-recent-'));
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

beforeEach(() => {
  clearRecentFiles();
});

describe('addRecentFile', () => {
  it('adds a new file to the front of the list', () => {
    addRecentFile('/path/to/a.cnb');
    const files = getRecentFiles();
    expect(files[0].path).toBe('/path/to/a.cnb');
    expect(files[0].name).toBe('a.cnb');
  });

  it('prepends a second file before the first', () => {
    addRecentFile('/path/a.cnb');
    addRecentFile('/path/b.cnb');
    const files = getRecentFiles();
    expect(files[0].path).toBe('/path/b.cnb');
    expect(files[1].path).toBe('/path/a.cnb');
  });

  it('moves a duplicate to the front', () => {
    addRecentFile('/path/a.cnb');
    addRecentFile('/path/b.cnb');
    addRecentFile('/path/a.cnb'); // re-add 'a'
    const files = getRecentFiles();
    expect(files[0].path).toBe('/path/a.cnb');
    expect(files.filter((f) => f.path === '/path/a.cnb').length).toBe(1);
  });

  it('caps the list at 12 entries', () => {
    for (let i = 0; i < 15; i++) addRecentFile(`/path/nb${i}.cnb`);
    expect(getRecentFiles().length).toBe(12);
  });

  it('stores a date string', () => {
    addRecentFile('/test.cnb');
    const entry = getRecentFiles()[0];
    expect(entry.date).toBeTruthy();
    expect(() => new Date(entry.date)).not.toThrow();
  });
});

// Regression: saveRecentFiles must never fall back to the cwd. Before loadRecentFiles()
// sets the userData dir, path.join('', 'recent-files.json') would otherwise drop a stray
// tracked copy in the repo root — the long-lived source of the recent-files.json noise.
describe('saveRecentFiles guard', () => {
  it('writes nothing to the cwd before loadRecentFiles has set the userData dir', () => {
    const prevCwd = process.cwd();
    process.chdir(tmpDir); // known-clean cwd so a stray write would be unambiguous
    try {
      addRecentFile('/before-init.cnb'); // _userDataPath still unset → guard blocks the write
      expect(fs.existsSync(path.join(tmpDir, 'recent-files.json'))).toBe(false);
    } finally {
      process.chdir(prevCwd);
    }
    // The in-memory list still updates even when the save is skipped.
    expect(getRecentFiles()[0].path).toBe('/before-init.cnb');
  });

  it('writes into the userData dir (never the cwd) once initialised', () => {
    loadRecentFiles(tmpDir); // reads (absent → []) and sets the userData dir
    addRecentFile('/after-init.cnb');
    const written = path.join(tmpDir, 'recent-files.json');
    expect(fs.existsSync(written)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(written, 'utf-8'));
    expect(saved[0].path).toBe('/after-init.cnb');
  });
});
