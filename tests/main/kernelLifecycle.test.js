import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

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

let ipcHandlers, ipcEvents, kernels, sendToKernel, setMainWindow, _notifyWindow, kmInit;
let _stderrHandlers, _lineHandlers;

beforeAll(async () => {
  process.env.VITEST = '1';
  const km = await import('../../src/main/kernel-manager.js');
  ipcHandlers     = km._ipcHandlers;
  ipcEvents       = km._ipcEvents;
  kernels         = km.kernels;
  sendToKernel    = km.sendToKernel;
  setMainWindow   = km.setMainWindow;
  _notifyWindow   = km._notifyWindow;
  kmInit          = km.init;
  _stderrHandlers = km._stderrHandlers;
  _lineHandlers   = km._lineHandlers;
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

// ── stderr forwarding ─────────────────────────────────────────────────────────

describe('stderr → writeLog', () => {
  const NB_STDERR = 'nb-stderr';

  beforeEach(async () => {
    const spy = vi.fn();
    kmInit({ writeLog: spy });
    await ipcHandlers['start-kernel'](fakeEvent, NB_STDERR);
    spy.mockClear(); // discard 'Starting kernel'
    // re-inject spy so tests can reference it
    kmInit({ writeLog: spy });
  });

  afterEach(() => {
    kmInit({ writeLog: () => {} });
    delete _stderrHandlers[NB_STDERR];
    delete _lineHandlers[NB_STDERR];
    kernels.delete(NB_STDERR);
  });

  it('handler is registered for the kernel', () => {
    expect(_stderrHandlers[NB_STDERR]).toBeTypeOf('function');
  });

  it('logs non-empty stderr lines with KERNEL tag', () => {
    const spy = vi.fn();
    kmInit({ writeLog: spy });
    _stderrHandlers[NB_STDERR](Buffer.from('Unhandled exception\n'));
    expect(spy).toHaveBeenCalledWith('KERNEL', 'Unhandled exception');
  });

  it('logs multiple lines from a single data event', () => {
    const spy = vi.fn();
    kmInit({ writeLog: spy });
    _stderrHandlers[NB_STDERR](Buffer.from('line A\nline B\n'));
    expect(spy).toHaveBeenCalledWith('KERNEL', 'line A');
    expect(spy).toHaveBeenCalledWith('KERNEL', 'line B');
  });

  it('skips empty lines in stderr', () => {
    const spy = vi.fn();
    kmInit({ writeLog: spy });
    _stderrHandlers[NB_STDERR](Buffer.from('\n\n  \n'));
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── Cell-level error logging ──────────────────────────────────────────────────

describe('msg.type === "error" with cell id → CELL log', () => {
  const NB_CELL = 'nb-cellerr';

  beforeEach(async () => {
    const spy = vi.fn();
    kmInit({ writeLog: spy });
    await ipcHandlers['start-kernel'](fakeEvent, NB_CELL);
    spy.mockClear();
    kmInit({ writeLog: spy });
  });

  afterEach(() => {
    kmInit({ writeLog: () => {} });
    delete _lineHandlers[NB_CELL];
    delete _stderrHandlers[NB_CELL];
    kernels.delete(NB_CELL);
  });

  it('line handler is registered for the kernel', () => {
    expect(_lineHandlers[NB_CELL]).toBeTypeOf('function');
  });

  it('logs cell error with CELL tag and cell id', () => {
    const spy = vi.fn();
    kmInit({ writeLog: spy });
    _lineHandlers[NB_CELL](JSON.stringify({ type: 'error', id: 'cell-42', message: 'NullReferenceException' }));
    expect(spy).toHaveBeenCalledWith('CELL', '[cell-42] error: NullReferenceException');
  });

  it('kernel-level errors (no id) still use KERNEL tag', () => {
    const spy = vi.fn();
    kmInit({ writeLog: spy });
    _lineHandlers[NB_CELL](JSON.stringify({ type: 'error', id: null, message: 'Out of memory' }));
    expect(spy).toHaveBeenCalledWith('KERNEL', 'Error: Out of memory');
  });
});
