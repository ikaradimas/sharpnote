import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

// vi.mock('net') does not intercept CJS require() for Node built-ins.
// Instead, we use the real net.Socket and spy on the instance after creation.

const mockProcess = {
  stdin:  { write: vi.fn(), writable: true, on: vi.fn() },
  stdout: { on: vi.fn(), destroy: vi.fn() },
  stderr: { on: vi.fn(), destroy: vi.fn() },
  on:     vi.fn(),
  kill:   vi.fn(),
};

vi.mock('child_process', () => ({ spawn: vi.fn().mockReturnValue(mockProcess) }));
vi.mock('readline',      () => ({ createInterface: vi.fn().mockReturnValue({ on: vi.fn() }) }));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    mkdirSync:     vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync:  vi.fn().mockReturnValue('[]'),
    existsSync:    vi.fn().mockReturnValue(true),
  };
});

let ipcHandlers, ipcEvents, kernels, setMainWindow;
let _lineHandlers;

const NB_ID    = 'nb-lsp-test';
// Use a path that will fail quickly — socket is still returned synchronously
const LSP_PIPE = '/tmp/sharpnote-lsp-proxy-test-nonexistent';
const fakeEvt  = {};

beforeAll(async () => {
  process.env.VITEST = '1';
  const km    = await import('../../src/main/kernel-manager.js');
  ipcHandlers = km._ipcHandlers;
  ipcEvents   = km._ipcEvents;
  kernels     = km.kernels;
  setMainWindow = km.setMainWindow;
  _lineHandlers = km._lineHandlers;
});

beforeEach(async () => {
  vi.clearAllMocks();
  kernels.clear();
  setMainWindow(null);
  await ipcHandlers['start-kernel'](fakeEvt, NB_ID);
});

afterEach(() => {
  // Destroy any live socket to avoid handle leaks
  const entry = kernels.get(NB_ID);
  if (entry?.lspSocket && !entry.lspSocket.destroyed) {
    try { entry.lspSocket.destroy(); } catch (_) {}
  }
  kernels.delete(NB_ID);
  delete _lineHandlers[NB_ID];
  setMainWindow(null);
});

describe('LSP socket connect on ready', () => {
  it('stores a socket on the entry when ready includes lspPipe', () => {
    _lineHandlers[NB_ID](JSON.stringify({ type: 'ready', lspPipe: LSP_PIPE }));
    const entry = kernels.get(NB_ID);
    expect(entry.lspSocket).toBeDefined();
    expect(entry.lspSocket).not.toBeNull();
  });

  it('does not attach a socket when ready has no lspPipe', () => {
    _lineHandlers[NB_ID](JSON.stringify({ type: 'ready' }));
    const entry = kernels.get(NB_ID);
    expect(entry.lspSocket).toBeNull();
  });

  it('registers a data handler on the socket', () => {
    _lineHandlers[NB_ID](JSON.stringify({ type: 'ready', lspPipe: LSP_PIPE }));
    const entry = kernels.get(NB_ID);
    expect(entry.lspSocket.listenerCount('data')).toBe(1);
  });
});

describe('lsp-send IPC event', () => {
  it('lsp-send handler is registered', () => {
    expect(ipcEvents['lsp-send']).toBeTypeOf('function');
  });

  it('writes data to the socket', () => {
    _lineHandlers[NB_ID](JSON.stringify({ type: 'ready', lspPipe: LSP_PIPE }));
    const entry = kernels.get(NB_ID);
    const writeSpy = vi.spyOn(entry.lspSocket, 'write').mockReturnValue(true);

    ipcEvents['lsp-send'](fakeEvt, { notebookId: NB_ID, data: 'Content-Length: 5\r\n\r\nhello' });
    expect(writeSpy).toHaveBeenCalledWith('Content-Length: 5\r\n\r\nhello');
  });

  it('is a no-op for an unknown notebookId', () => {
    _lineHandlers[NB_ID](JSON.stringify({ type: 'ready', lspPipe: LSP_PIPE }));
    const entry = kernels.get(NB_ID);
    const writeSpy = vi.spyOn(entry.lspSocket, 'write').mockReturnValue(true);

    ipcEvents['lsp-send'](fakeEvt, { notebookId: 'unknown', data: 'data' });
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

describe('socket data → lsp-receive', () => {
  it('emits lsp-receive to renderer when socket receives data', () => {
    const send = vi.fn();
    setMainWindow({ isDestroyed: () => false, webContents: { send } });

    _lineHandlers[NB_ID](JSON.stringify({ type: 'ready', lspPipe: LSP_PIPE }));
    const entry = kernels.get(NB_ID);

    // Manually trigger the data event — simulates bytes arriving from the kernel LSP server
    entry.lspSocket.emit('data', Buffer.from('Content-Length: 5\r\n\r\nhello'));

    expect(send).toHaveBeenCalledWith('lsp-receive', {
      notebookId: NB_ID,
      data: 'Content-Length: 5\r\n\r\nhello',
    });
  });

  it('does not emit when the window is destroyed', () => {
    const send = vi.fn();
    setMainWindow({ isDestroyed: () => true, webContents: { send } });

    _lineHandlers[NB_ID](JSON.stringify({ type: 'ready', lspPipe: LSP_PIPE }));
    const entry = kernels.get(NB_ID);
    entry.lspSocket.emit('data', Buffer.from('hello'));

    expect(send).not.toHaveBeenCalled();
  });
});

describe('kill destroys LSP socket', () => {
  it('destroys the socket when the kernel is killed', () => {
    _lineHandlers[NB_ID](JSON.stringify({ type: 'ready', lspPipe: LSP_PIPE }));
    const entry = kernels.get(NB_ID);
    const destroySpy = vi.spyOn(entry.lspSocket, 'destroy');

    ipcHandlers['stop-kernel'](fakeEvt, NB_ID);
    expect(destroySpy).toHaveBeenCalled();
  });
});
