import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('[]'),
  };
});

let addRecentFile, getRecentFiles, clearRecentFiles;

beforeAll(async () => {
  process.env.VITEST = '1';
  const rf = await import('../../src/main/recent-files.js');
  addRecentFile    = rf.addRecentFile;
  getRecentFiles   = rf.getRecentFiles;
  clearRecentFiles = rf.clearRecentFiles;
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
