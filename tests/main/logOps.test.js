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
