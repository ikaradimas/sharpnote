import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Use a real temp directory — the same pattern as fileOps.test.js.
// Mocking Node built-ins (fs) doesn't reliably intercept CJS require() calls.
const tmpDir = path.join(os.tmpdir(), `sharpnote-logops-test-${Date.now()}`);

let logOps;
beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  logOps = await import('../../src/main/log-ops.js');
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

beforeEach(() => {
  logOps.init({ logDir: tmpDir, mainWindow: null });
  // Remove any log files written by previous tests.
  for (const f of fs.readdirSync(tmpDir).filter(n => n.endsWith('.log'))) {
    fs.unlinkSync(path.join(tmpDir, f));
  }
});

// ── writeLog: window guards ───────────────────────────────────────────────────

describe('writeLog — window guard', () => {
  it('does not throw when _mainWindow is null', () => {
    logOps.setMainWindow(null);
    expect(() => logOps.writeLog('TEST', 'hello')).not.toThrow();
  });

  it('does not call webContents.send when window is destroyed', () => {
    const send = vi.fn();
    logOps.setMainWindow({ isDestroyed: () => true, webContents: { send } });
    logOps.writeLog('TEST', 'hello');
    expect(send).not.toHaveBeenCalled();
  });

  it('calls webContents.send when window is alive', () => {
    const send = vi.fn();
    logOps.setMainWindow({ isDestroyed: () => false, webContents: { send } });
    logOps.writeLog('KERNEL', 'started');
    expect(send).toHaveBeenCalledWith('log-entry', expect.objectContaining({
      tag: 'KERNEL', message: 'started',
    }));
  });

  it('includes timestamp and tag in the IPC payload', () => {
    const send = vi.fn();
    logOps.setMainWindow({ isDestroyed: () => false, webContents: { send } });
    logOps.writeLog('CELL', 'ran');
    const payload = send.mock.calls[0][1];
    expect(payload.tag).toBe('CELL');
    expect(payload.message).toBe('ran');
    expect(typeof payload.timestamp).toBe('string');
  });

  it('does not throw when window is null', () => {
    logOps.setMainWindow(null);
    expect(() => logOps.writeLog('X', 'y')).not.toThrow();
  });
});

// ── writeLog: file writing ────────────────────────────────────────────────────

describe('writeLog — file writing', () => {
  it('writes to a dated log file under logDir', () => {
    logOps.writeLog('UI', 'test message');
    const date = new Date().toISOString().split('T')[0];
    const content = fs.readFileSync(path.join(tmpDir, `${date}.log`), 'utf-8');
    expect(content).toContain('[UI] test message');
  });

  it('creates the log directory if it does not exist', () => {
    const newDir = path.join(tmpDir, 'nested', 'logs');
    logOps.init({ logDir: newDir, mainWindow: null });
    logOps.writeLog('UI', 'msg');
    expect(fs.existsSync(newDir)).toBe(true);
  });

  it('appends multiple entries to the same dated file', () => {
    logOps.writeLog('A', 'first');
    logOps.writeLog('B', 'second');
    const date = new Date().toISOString().split('T')[0];
    const content = fs.readFileSync(path.join(tmpDir, `${date}.log`), 'utf-8');
    expect(content).toContain('[A] first');
    expect(content).toContain('[B] second');
  });
});

// ── tailLogContent (pure) ─────────────────────────────────────────────────────

describe('tailLogContent', () => {
  it('returns all lines untruncated when under the limit', () => {
    const text = 'a\nb\nc';
    const r = logOps.tailLogContent(text, 1000);
    expect(r).toEqual({ text: 'a\nb\nc', total: 3, truncated: false });
  });

  it('keeps only the last `limit` lines and reports the true total', () => {
    const text = Array.from({ length: 2500 }, (_, i) => `line${i}`).join('\n');
    const r = logOps.tailLogContent(text, 1000);
    const lines = r.text.split('\n');
    expect(r.total).toBe(2500);
    expect(r.truncated).toBe(true);
    expect(lines).toHaveLength(1000);
    expect(lines[0]).toBe('line1500');            // first kept = total - limit
    expect(lines[lines.length - 1]).toBe('line2499'); // last line preserved
  });

  it('ignores blank lines (matches the renderer parser)', () => {
    const r = logOps.tailLogContent('a\n\n\nb\n', 1000);
    expect(r.total).toBe(2);
    expect(r.text).toBe('a\nb');
  });

  it('handles empty/blank input', () => {
    expect(logOps.tailLogContent('', 1000)).toEqual({ text: '', total: 0, truncated: false });
    expect(logOps.tailLogContent(null, 1000)).toEqual({ text: '', total: 0, truncated: false });
  });
});

// ── readLogFileTail (disk + basename guard) ───────────────────────────────────

describe('readLogFileTail', () => {
  beforeEach(() => { logOps.init({ logDir: tmpDir, mainWindow: null }); });

  it('reads only the last `limit` entries of a large file', () => {
    const name = 'big.log';
    const text = Array.from({ length: 3000 }, (_, i) => `${new Date(0).toISOString()} [RUN] entry ${i}`).join('\n') + '\n';
    fs.writeFileSync(path.join(tmpDir, name), text);
    const r = logOps.readLogFileTail(name, 1000);
    expect(r.total).toBe(3000);
    expect(r.truncated).toBe(true);
    expect(r.text.split('\n')).toHaveLength(1000);
    expect(r.text).toContain('entry 2999');
    expect(r.text).not.toContain('entry 1998'); // beyond the last 1000
  });

  it('returns the whole (untruncated) file when under the limit', () => {
    fs.writeFileSync(path.join(tmpDir, 'small.log'), 'x [A] one\ny [B] two\n');
    const r = logOps.readLogFileTail('small.log', 1000);
    expect(r).toEqual({ text: 'x [A] one\ny [B] two', total: 2, truncated: false });
  });

  it('is confined to the log directory (path-traversal safe)', () => {
    // basename() strips any traversal; the bare name won't exist in tmpDir.
    const r = logOps.readLogFileTail('../../../../etc/hosts', 1000);
    expect(r).toEqual({ text: '', total: 0, truncated: false });
  });

  it('returns empty for a missing file', () => {
    expect(logOps.readLogFileTail('nope.log', 1000)).toEqual({ text: '', total: 0, truncated: false });
  });
});
