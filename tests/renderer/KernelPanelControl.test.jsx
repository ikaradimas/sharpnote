import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// ── Minimal harness component ────────────────────────────────────────────────
// Rather than renderHook (which has React concurrent-mode quirks in happy-dom),
// we test the kernel message router by rendering a minimal component that calls
// useKernelManager and exposes its effects through the mocked electronAPI.

import { useKernelManager } from '../../src/hooks/useKernelManager.js';

let registeredHandler = null;
const mockSendToKernel = vi.fn();

// Override the global electronAPI for these tests
beforeEach(() => {
  registeredHandler = null;
  mockSendToKernel.mockClear();
  window.electronAPI = {
    startKernel:      vi.fn(),
    onKernelMessage:  (fn) => { registeredHandler = fn; },
    offKernelMessage: () => { registeredHandler = null; },
    sendToKernel:     mockSendToKernel,
  };
});

// Emit a kernel message as if it arrived from the kernel process
function emit(notebookId, type, extra = {}) {
  registeredHandler?.({ notebookId, message: { type, ...extra } });
}

// Render useKernelManager with given options; returns opts so callers can inspect mocks
function mountHook(overrides = {}) {
  const opts = {
    setNb:               vi.fn(),
    notebooksRef:        { current: [{ id: 'nb-1', nugetPackages: [], attachedDbs: [], nugetSources: [], config: [] }] },
    dbConnectionsRef:    { current: [] },
    setVarInspectDialog: vi.fn(),
    onPanelVisible:      vi.fn(),
    setDbConnections:    vi.fn(),
    ...overrides,
  };

  function Harness() {
    useKernelManager(opts);
    return null;
  }
  render(<Harness />);
  return opts;
}

// ── panel_open / close / toggle ──────────────────────────────────────────────

describe('KernelPanelControl — panel_open', () => {
  it('calls onPanelVisible(panel, true)', () => {
    const opts = mountHook();
    act(() => emit('nb-1', 'panel_open', { panel: 'graph' }));
    expect(opts.onPanelVisible).toHaveBeenCalledWith('graph', true);
  });

  it('works for any panel ID', () => {
    const panels = ['log', 'nuget', 'config', 'db', 'library', 'vars', 'toc', 'files', 'api', 'graph', 'todo'];
    for (const panel of panels) {
      const opts = mountHook();
      act(() => emit('nb-1', 'panel_open', { panel }));
      expect(opts.onPanelVisible).toHaveBeenCalledWith(panel, true);
    }
  });
});

describe('KernelPanelControl — panel_close', () => {
  it('calls onPanelVisible(panel, false)', () => {
    const opts = mountHook();
    act(() => emit('nb-1', 'panel_close', { panel: 'log' }));
    expect(opts.onPanelVisible).toHaveBeenCalledWith('log', false);
  });
});

describe('KernelPanelControl — panel_toggle', () => {
  it('calls onPanelVisible(panel, null)', () => {
    const opts = mountHook();
    act(() => emit('nb-1', 'panel_toggle', { panel: 'config' }));
    expect(opts.onPanelVisible).toHaveBeenCalledWith('config', null);
  });
});

// ── db_add ────────────────────────────────────────────────────────────────────

describe('KernelPanelControl — db_add', () => {
  it('calls setDbConnections with a new connection entry', () => {
    const opts = mountHook();
    act(() => emit('nb-1', 'db_add', { name: 'northwind', provider: 'sqlite', connectionString: 'Data Source=north.db' }));
    expect(opts.setDbConnections).toHaveBeenCalledOnce();
    const updater = opts.setDbConnections.mock.calls[0][0];
    const result = updater([]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'northwind', provider: 'sqlite', connectionString: 'Data Source=north.db' });
    expect(result[0].id).toBeTruthy();
  });

  it('appends to existing connections', () => {
    const opts = mountHook();
    act(() => emit('nb-1', 'db_add', { name: 'new', provider: 'redis', connectionString: 'localhost:6379' }));
    const updater = opts.setDbConnections.mock.calls[0][0];
    const result = updater([{ id: 'x', name: 'old', provider: 'sqlite', connectionString: '' }]);
    expect(result).toHaveLength(2);
    expect(result[1].name).toBe('new');
  });
});

// ── db_remove ────────────────────────────────────────────────────────────────

describe('KernelPanelControl — db_remove', () => {
  it('removes connection by name', () => {
    const opts = mountHook();
    act(() => emit('nb-1', 'db_remove', { name: 'northwind' }));
    const updater = opts.setDbConnections.mock.calls[0][0];
    const result = updater([
      { id: '1', name: 'northwind', provider: 'sqlite', connectionString: '' },
      { id: '2', name: 'other',     provider: 'redis',  connectionString: '' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('other');
  });

  it('is a no-op when name does not exist', () => {
    const opts = mountHook();
    act(() => emit('nb-1', 'db_remove', { name: 'missing' }));
    const updater = opts.setDbConnections.mock.calls[0][0];
    expect(updater([{ id: '1', name: 'kept', provider: 'sqlite', connectionString: '' }])).toHaveLength(1);
  });
});

// ── config_set ───────────────────────────────────────────────────────────────

describe('KernelPanelControl — config_set', () => {
  it('adds a new key-value entry', () => {
    const opts = mountHook();
    act(() => emit('nb-1', 'config_set', { key: 'env', value: 'staging' }));
    const [, updater] = opts.setNb.mock.calls.find(([id]) => id === 'nb-1') ?? [];
    expect(updater({ config: [] }).config).toEqual([{ key: 'env', value: 'staging' }]);
  });

  it('updates an existing key in-place', () => {
    const opts = mountHook();
    act(() => emit('nb-1', 'config_set', { key: 'env', value: 'production' }));
    const [, updater] = opts.setNb.mock.calls.find(([id]) => id === 'nb-1') ?? [];
    expect(updater({ config: [{ key: 'env', value: 'staging' }] }).config)
      .toEqual([{ key: 'env', value: 'production' }]);
  });

  it('leaves other keys untouched', () => {
    const opts = mountHook();
    act(() => emit('nb-1', 'config_set', { key: 'newKey', value: 'val' }));
    const [, updater] = opts.setNb.mock.calls.find(([id]) => id === 'nb-1') ?? [];
    const result = updater({ config: [{ key: 'existing', value: 'x' }] });
    expect(result.config).toHaveLength(2);
    expect(result.config[0].key).toBe('existing');
  });
});

// ── config_remove ─────────────────────────────────────────────────────────────

describe('KernelPanelControl — config_remove', () => {
  it('removes the named key', () => {
    const opts = mountHook();
    act(() => emit('nb-1', 'config_remove', { key: 'env' }));
    const [, updater] = opts.setNb.mock.calls.find(([id]) => id === 'nb-1') ?? [];
    const result = updater({ config: [{ key: 'env', value: 'staging' }, { key: 'other', value: 'x' }] });
    expect(result.config).toEqual([{ key: 'other', value: 'x' }]);
  });

  it('is a no-op when key does not exist', () => {
    const opts = mountHook();
    act(() => emit('nb-1', 'config_remove', { key: 'missing' }));
    const [, updater] = opts.setNb.mock.calls.find(([id]) => id === 'nb-1') ?? [];
    expect(updater({ config: [{ key: 'keep', value: 'v' }] }).config).toHaveLength(1);
  });
});

// ── db_attach / db_detach ─────────────────────────────────────────────────────

describe('KernelPanelControl — db_attach', () => {
  it('sends db_connect to kernel when named connection exists', () => {
    const conn = { id: 'conn-1', name: 'northwind', provider: 'sqlite', connectionString: 'Data Source=x.db' };
    mountHook({ dbConnectionsRef: { current: [conn] } });
    act(() => emit('nb-1', 'db_attach', { name: 'northwind' }));
    expect(mockSendToKernel).toHaveBeenCalledWith('nb-1', expect.objectContaining({ type: 'db_connect', connectionId: 'conn-1' }));
  });

  it('does nothing when named connection does not exist', () => {
    mountHook();
    act(() => emit('nb-1', 'db_attach', { name: 'missing' }));
    expect(mockSendToKernel).not.toHaveBeenCalledWith('nb-1', expect.objectContaining({ type: 'db_connect' }));
  });
});

describe('KernelPanelControl — db_detach', () => {
  it('sends db_disconnect to kernel when named connection exists', () => {
    const conn = { id: 'conn-2', name: 'mydb', provider: 'redis', connectionString: '' };
    mountHook({ dbConnectionsRef: { current: [conn] } });
    act(() => emit('nb-1', 'db_detach', { name: 'mydb' }));
    expect(mockSendToKernel).toHaveBeenCalledWith('nb-1', expect.objectContaining({ type: 'db_disconnect', connectionId: 'conn-2' }));
  });
});
