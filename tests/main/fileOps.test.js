import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// No fs mock needed — tests use a real temp directory so the real fs works.
// Only readline is mocked to avoid hanging on stdin.
vi.mock('readline', () => ({
  createInterface: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
}));

const tmpDir = path.join(os.tmpdir(), `sharpnote-fileops-test-${Date.now()}`);
let ipcHandlers, shell, dialogMock;
const fakeEvent = {};

beforeAll(async () => {
  // Create test directory structure
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'subdir'));
  fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'hello');

  process.env.VITEST = '1';
  const fo = await import('../../src/main/file-ops.js');
  ipcHandlers = fo._ipcHandlers;
  shell = fo._shell;
  dialogMock = fo._dialog; // the exact injected dialog the handlers call
  vi.spyOn(shell, 'trashItem').mockResolvedValue(undefined);
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('IPC – fs-readdir', () => {
  it('returns success with entries sorted (dirs first)', async () => {
    const result = await ipcHandlers['fs-readdir'](fakeEvent, tmpDir);
    expect(result.success).toBe(true);
    expect(Array.isArray(result.entries)).toBe(true);
    const names = result.entries.map((e) => e.name);
    expect(names).toContain('subdir');
    expect(names).toContain('file.txt');
    // Dirs should come before files
    expect(names.indexOf('subdir')).toBeLessThan(names.indexOf('file.txt'));
  });

  it('returns isDirectory=true for directories', async () => {
    const result = await ipcHandlers['fs-readdir'](fakeEvent, tmpDir);
    const subdir = result.entries.find((e) => e.name === 'subdir');
    expect(subdir.isDirectory).toBe(true);
  });

  it('returns size and mtime for files', async () => {
    const result = await ipcHandlers['fs-readdir'](fakeEvent, tmpDir);
    const file = result.entries.find((e) => e.name === 'file.txt');
    expect(typeof file.size).toBe('number');
    expect(typeof file.mtime).toBe('number');
  });

  it('returns parentDir as the parent of the given dir', async () => {
    const result = await ipcHandlers['fs-readdir'](fakeEvent, tmpDir);
    expect(result.parentDir).toBe(path.dirname(tmpDir));
  });
});

describe('IPC – fs-rename', () => {
  it('returns success', async () => {
    const src = path.join(tmpDir, 'rename-src.txt');
    const dst = path.join(tmpDir, 'rename-dst.txt');
    fs.writeFileSync(src, 'x');
    const result = await ipcHandlers['fs-rename'](fakeEvent, { oldPath: src, newPath: dst });
    expect(result.success).toBe(true);
    expect(fs.existsSync(dst)).toBe(true);
  });
});

describe('IPC – fs-delete', () => {
  it('calls shell.trashItem with the given path', async () => {
    const filePath = path.join(tmpDir, 'deleteme.txt');
    fs.writeFileSync(filePath, 'bye');
    const result = await ipcHandlers['fs-delete'](fakeEvent, filePath);
    expect(result.success).toBe(true);
    expect(shell.trashItem).toHaveBeenCalledWith(filePath);
  });
});

describe('IPC – fs-mkdir', () => {
  it('returns success', async () => {
    const newDir = path.join(tmpDir, 'new-subdir');
    const result = await ipcHandlers['fs-mkdir'](fakeEvent, newDir);
    expect(result.success).toBe(true);
    expect(fs.existsSync(newDir)).toBe(true);
  });
});

describe('IPC – fs-get-home', () => {
  it('returns the home path', async () => {
    const result = await ipcHandlers['fs-get-home'](fakeEvent);
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });
});

describe('IPC – export-embedded-file', () => {
  it('writes a text entry as UTF-8 and round-trips', async () => {
    const out = path.join(tmpDir, 'exported.txt');
    vi.spyOn(dialogMock, 'showSaveDialog').mockResolvedValue({ canceled: false, filePath: out });
    const res = await ipcHandlers['export-embedded-file'](fakeEvent, {
      filename: 'notes.txt', content: 'héllo\nworld', encoding: 'text',
    });
    expect(res.success).toBe(true);
    expect(res.filePath).toBe(out);
    expect(fs.readFileSync(out, 'utf-8')).toBe('héllo\nworld');
    dialogMock.showSaveDialog.mockRestore();
  });

  it('decodes a base64 entry to raw bytes (binary-safe, not UTF-8)', async () => {
    const out = path.join(tmpDir, 'exported.bin');
    const bytes = Buffer.from([0x00, 0xff, 0x10, 0x89]); // incl. NUL/high bytes UTF-8 would mangle
    vi.spyOn(dialogMock, 'showSaveDialog').mockResolvedValue({ canceled: false, filePath: out });
    const res = await ipcHandlers['export-embedded-file'](fakeEvent, {
      filename: 'blob.bin', content: bytes.toString('base64'), encoding: 'base64',
    });
    expect(res.success).toBe(true);
    expect(fs.readFileSync(out).equals(bytes)).toBe(true);
    dialogMock.showSaveDialog.mockRestore();
  });

  it('passes defaultPath = filename to the save dialog', async () => {
    const spy = vi.spyOn(dialogMock, 'showSaveDialog').mockResolvedValue({ canceled: true });
    await ipcHandlers['export-embedded-file'](fakeEvent, { filename: 'data.csv', content: 'x', encoding: 'text' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'data.csv' }));
    spy.mockRestore();
  });

  it('returns canceled without writing when the dialog is dismissed', async () => {
    const out = path.join(tmpDir, 'should-not-exist.txt');
    vi.spyOn(dialogMock, 'showSaveDialog').mockResolvedValue({ canceled: true, filePath: out });
    const res = await ipcHandlers['export-embedded-file'](fakeEvent, {
      filename: 'x.txt', content: 'nope', encoding: 'text',
    });
    expect(res).toEqual({ success: false, canceled: true });
    expect(fs.existsSync(out)).toBe(false);
    dialogMock.showSaveDialog.mockRestore();
  });
});

describe('IPC – get-env-var', () => {
  it('returns value of existing env var', async () => {
    process.env.__SHARPNOTE_TEST_VAR__ = 'test-value-123';
    const result = await ipcHandlers['get-env-var'](fakeEvent, '__SHARPNOTE_TEST_VAR__');
    expect(result).toBe('test-value-123');
    delete process.env.__SHARPNOTE_TEST_VAR__;
  });

  it('returns empty string for non-existent env var', async () => {
    const result = await ipcHandlers['get-env-var'](fakeEvent, '__SHARPNOTE_NONEXISTENT__');
    expect(result).toBe('');
  });

  it('returns empty string for non-string input', async () => {
    const result = await ipcHandlers['get-env-var'](fakeEvent, 42);
    expect(result).toBe('');
  });

  it('returns empty string for empty string input', async () => {
    const result = await ipcHandlers['get-env-var'](fakeEvent, '');
    expect(result).toBe('');
  });
});
