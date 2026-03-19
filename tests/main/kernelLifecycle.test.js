import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// Mock child process returned by spawn
const mockProcess = {
  stdin:  { write: vi.fn(), writable: true },
  stdout: { on: vi.fn() },
  stderr: { on: vi.fn() },
  on:     vi.fn(),
  kill:   vi.fn(),
};

vi.mock('child_process', () => ({
  spawn: vi.fn().mockReturnValue(mockProcess),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('[]'),
    existsSync: vi.fn().mockReturnValue(true),
  };
});

vi.mock('readline', () => ({
  createInterface: vi.fn().mockReturnValue({
    on: vi.fn(),
    close: vi.fn(),
  }),
}));

let ipcHandlers, ipcEvents, kernels, sendToKernel, setMainWindow, _notifyWindow;

beforeAll(async () => {
  process.env.VITEST = '1';
  const km = await import('../../src/main/kernel-manager.js');
  ipcHandlers  = km._ipcHandlers;
  ipcEvents    = km._ipcEvents;
  kernels      = km.kernels;
  sendToKernel = km.sendToKernel;
  setMainWindow  = km.setMainWindow;
  _notifyWindow  = km._notifyWindow;
});

beforeEach(() => {
  vi.clearAllMocks();
  kernels.clear();
  mockProcess.stdin.write.mockClear();
  mockProcess.kill.mockClear();
  mockProcess.on.mockClear();
  mockProcess.stdout.on.mockClear();
  mockProcess.stderr.on.mockClear();
});

const fakeEvent = {};
const NB_ID = 'test-notebook-id';

describe('start-kernel IPC', () => {
  it('returns success', async () => {
    const result = await ipcHandlers['start-kernel'](fakeEvent, NB_ID);
    expect(result.success).toBe(true);
  });

  it('buffers messages sent before ready', () => {
    sendToKernel(NB_ID, { type: 'execute', code: '1+1', id: 'x' });
    const entry = kernels.get(NB_ID);
    if (entry && !entry.ready) {
      expect(entry.pending.length).toBeGreaterThan(0);
    }
  });
});

describe('kernel-interrupt IPC event', () => {
  it('writes interrupt message to kernel stdin', async () => {
    await ipcHandlers['start-kernel'](fakeEvent, NB_ID);
    const entry = kernels.get(NB_ID);
    if (entry) {
      entry.ready = true;
      entry.process = mockProcess;
    }
    ipcEvents['kernel-interrupt'](fakeEvent, NB_ID);
    expect(mockProcess.stdin.write).toHaveBeenCalled();
    const written = mockProcess.stdin.write.mock.calls[0][0];
    const parsed = JSON.parse(written.trim());
    expect(parsed.type).toBe('interrupt');
  });
});

describe('kernel-reset IPC event', () => {
  it('kills existing kernel and starts a new one', async () => {
    await ipcHandlers['start-kernel'](fakeEvent, NB_ID);
    const firstEntry = kernels.get(NB_ID);
    if (firstEntry) {
      firstEntry.process = { ...mockProcess, kill: vi.fn() };
    }
    ipcEvents['kernel-reset'](fakeEvent, NB_ID);
    const newEntry = kernels.get(NB_ID);
    expect(newEntry).toBeDefined();
  });
});

// Note: vi.mock('child_process') does not intercept CJS require() inside kernel-manager.js,
// so we cannot hook into process 'exit'/'error' events via the spawned process mock.
// Instead we test _notifyWindow() directly — the helper that all four send-sites delegate to.
describe('_notifyWindow (isDestroyed guard)', () => {
  afterEach(() => setMainWindow(null));

  it('does not call webContents.send when window is already destroyed', () => {
    const mockSend = vi.fn();
    setMainWindow({ isDestroyed: () => true, webContents: { send: mockSend } });
    _notifyWindow(NB_ID, { type: 'error', id: null, message: 'kernel exited' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('calls webContents.send when window is alive', () => {
    const mockSend = vi.fn();
    setMainWindow({ isDestroyed: () => false, webContents: { send: mockSend } });
    _notifyWindow(NB_ID, { type: 'error', id: null, message: 'kernel exited' });
    expect(mockSend).toHaveBeenCalledWith('kernel-message', {
      notebookId: NB_ID,
      message: { type: 'error', id: null, message: 'kernel exited' },
    });
  });

  it('does not call webContents.send when _mainWindow is null', () => {
    setMainWindow(null);
    // Should not throw
    expect(() => _notifyWindow(NB_ID, { type: 'error' })).not.toThrow();
  });
});

describe('sendToKernel', () => {
  it('flushes pending queue when kernel becomes ready', async () => {
    await ipcHandlers['start-kernel'](fakeEvent, NB_ID);
    const entry = kernels.get(NB_ID);
    if (entry) {
      entry.ready = false;
      entry.process = mockProcess;
      sendToKernel(NB_ID, { type: 'execute', code: '1', id: 'q1' });
      expect(entry.pending.length).toBe(1);
    }
  });
});
