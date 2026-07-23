import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LogPanel } from '../../src/components/panels/log/LogPanel.jsx';

// ── Setup ──────────────────────────────────────────────────────────────────────

let onLogEntryCallback = null;

function makeAPI(overrides = {}) {
  return {
    getLogFiles:  vi.fn().mockResolvedValue([]),
    onLogEntry:   vi.fn((cb) => { onLogEntryCallback = cb; }),
    offLogEntry:  vi.fn(),
    readLogFile:  vi.fn().mockResolvedValue(''),
    readLogFileTail: vi.fn().mockResolvedValue({ text: '', total: 0, truncated: false }),
    openLogFile:  vi.fn().mockResolvedValue({ success: true }),
    saveFile:     vi.fn().mockResolvedValue({}),
    deleteLogFile: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

beforeEach(() => {
  onLogEntryCallback = null;
  window.electronAPI = makeAPI();
});

function pushEntry(entry) {
  act(() => { onLogEntryCallback?.(entry); });
}

function makeEntry(message, tag = 'USER') {
  return { timestamp: new Date().toISOString(), tag, message };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('LogPanel rendering', () => {
  it('renders nothing when isOpen=false', () => {
    const { container } = render(<LogPanel isOpen={false} onToggle={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when isOpen=true', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    expect(document.querySelector('.log-entries')).toBeInTheDocument();
  });

  it('shows empty state when no entries', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    expect(screen.getByText('No entries')).toBeInTheDocument();
  });

  it('shows a live entry when one arrives', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    pushEntry(makeEntry('hello world'));
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  it('calls onToggle when close button is clicked', () => {
    const onToggle = vi.fn();
    render(<LogPanel isOpen onToggle={onToggle} />);
    fireEvent.click(screen.getByTitle('Close logs'));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

// ── Short entries (non-collapsible) ───────────────────────────────────────────

describe('short entries — no toggle', () => {
  it('does not render a toggle for a short single-line message', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    pushEntry(makeEntry('short message'));
    expect(document.querySelector('.log-entry-toggle')).toBeNull();
  });

  it('does not apply collapsed class for short message', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    pushEntry(makeEntry('short'));
    expect(document.querySelector('.log-message-collapsed')).toBeNull();
  });
});

// ── Long entries (collapsible) ─────────────────────────────────────────────────

const LONG_MSG = 'x'.repeat(121);
const MULTILINE_MSG = 'line one\nline two\nline three';

describe('long single-line entry — collapsible', () => {
  it('renders a toggle button', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    pushEntry(makeEntry(LONG_MSG));
    expect(document.querySelector('.log-entry-toggle')).toBeInTheDocument();
  });

  it('starts collapsed (▶ icon)', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    pushEntry(makeEntry(LONG_MSG));
    expect(document.querySelector('.log-entry-toggle').textContent).toBe('▶');
  });

  it('message has collapsed class by default', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    pushEntry(makeEntry(LONG_MSG));
    expect(document.querySelector('.log-message-collapsed')).toBeInTheDocument();
  });

  it('clicking toggle expands (▼ icon)', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    pushEntry(makeEntry(LONG_MSG));
    fireEvent.click(document.querySelector('.log-entry-toggle'));
    expect(document.querySelector('.log-entry-toggle').textContent).toBe('▼');
  });

  it('expanded entry loses collapsed class', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    pushEntry(makeEntry(LONG_MSG));
    fireEvent.click(document.querySelector('.log-entry-toggle'));
    expect(document.querySelector('.log-message-collapsed')).toBeNull();
  });

  it('clicking toggle again re-collapses', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    pushEntry(makeEntry(LONG_MSG));
    fireEvent.click(document.querySelector('.log-entry-toggle'));
    fireEvent.click(document.querySelector('.log-entry-toggle'));
    expect(document.querySelector('.log-entry-toggle').textContent).toBe('▶');
    expect(document.querySelector('.log-message-collapsed')).toBeInTheDocument();
  });
});

describe('multi-line entry — collapsible', () => {
  it('renders a toggle for a multi-line message', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    pushEntry(makeEntry(MULTILINE_MSG));
    expect(document.querySelector('.log-entry-toggle')).toBeInTheDocument();
  });

  it('starts collapsed', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    pushEntry(makeEntry(MULTILINE_MSG));
    expect(document.querySelector('.log-message-collapsed')).toBeInTheDocument();
  });

  it('full content visible after expand', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    pushEntry(makeEntry(MULTILINE_MSG));
    fireEvent.click(document.querySelector('.log-entry-toggle'));
    // All lines present in the DOM text
    const msgEl = document.querySelector('.log-message');
    expect(msgEl.textContent).toContain('line one');
    expect(msgEl.textContent).toContain('line two');
    expect(msgEl.textContent).toContain('line three');
  });
});

// ── Memory label ──────────────────────────────────────────────────────────────

describe('memory label', () => {
  it('shows memory when memoryMb is set', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} currentMemoryMb={512} />);
    pushEntry({ ...makeEntry('msg'), memoryMb: 512 });
    expect(screen.getByText(/512 MB/)).toBeInTheDocument();
  });

  it('omits memory when memoryMb is null', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    pushEntry(makeEntry('msg'));
    expect(document.querySelector('.log-memory')).toBeNull();
  });
});

// ── Clear live log ─────────────────────────────────────────────────────────────

describe('clear live log', () => {
  it('clears all entries when clear button is clicked', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} />);
    pushEntry(makeEntry('entry 1'));
    pushEntry(makeEntry('entry 2'));
    fireEvent.click(screen.getByTitle('Clear live log'));
    expect(screen.getByText('No entries')).toBeInTheDocument();
  });
});

// ── Cell ID links ──────────────────────────────────────────────────────────────

describe('cell ID links', () => {
  const CELL_ID = 'a1b2c3d4'; // 8-char base-36

  it('renders a clickable link for a known cell ID in a log message', () => {
    const onNav = vi.fn();
    const cells = [{ id: CELL_ID }];
    render(<LogPanel isOpen onToggle={vi.fn()} cells={cells} onNavigateToCell={onNav} />);
    pushEntry(makeEntry(`Error in cell ${CELL_ID}`));
    expect(document.querySelector('.log-cell-link')).toBeInTheDocument();
  });

  it('does not render a link for an unknown 8-char token', () => {
    render(<LogPanel isOpen onToggle={vi.fn()} cells={[]} onNavigateToCell={vi.fn()} />);
    pushEntry(makeEntry('token zzzzzzzz here'));
    expect(document.querySelector('.log-cell-link')).toBeNull();
  });

  it('calls onNavigateToCell with the cell ID when link is clicked', () => {
    const onNav = vi.fn();
    const cells = [{ id: CELL_ID }];
    render(<LogPanel isOpen onToggle={vi.fn()} cells={cells} onNavigateToCell={onNav} />);
    pushEntry(makeEntry(`Error in cell ${CELL_ID}`));
    fireEvent.click(document.querySelector('.log-cell-link'));
    expect(onNav).toHaveBeenCalledWith(CELL_ID);
  });
});

// ── Large-file truncation notice ────────────────────────────────────────────────

describe('LogPanel — large file truncation', () => {
  async function selectFile(name) {
    render(<LogPanel isOpen onToggle={vi.fn()} cells={[]} />);
    await screen.findByRole('option', { name });
    fireEvent.change(document.querySelector('.log-file-select'), { target: { value: name } });
  }

  it('loads a file via the tail loader (last N entries), not the whole file', async () => {
    window.electronAPI = makeAPI({
      getLogFiles: vi.fn().mockResolvedValue(['big.log']),
      readLogFileTail: vi.fn().mockResolvedValue({ text: 'x [A] one', total: 5000, truncated: true }),
    });
    await selectFile('big.log');
    await screen.findByText(/Showing the last/i);
    expect(window.electronAPI.readLogFileTail).toHaveBeenCalledWith('big.log', 1000);
    expect(window.electronAPI.readLogFile).not.toHaveBeenCalled();
  });

  it('shows "last 1,000 of N" + an Open full file link that opens the file', async () => {
    window.electronAPI = makeAPI({
      getLogFiles: vi.fn().mockResolvedValue(['big.log']),
      readLogFileTail: vi.fn().mockResolvedValue({ text: 'x [A] one', total: 5000, truncated: true }),
    });
    await selectFile('big.log');
    expect(await screen.findByText(/Showing the last 1,000 of 5,000 entries/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Open full file/i }));
    expect(window.electronAPI.openLogFile).toHaveBeenCalledWith('big.log');
  });

  it('shows no notice when the file fits within the limit', async () => {
    window.electronAPI = makeAPI({
      getLogFiles: vi.fn().mockResolvedValue(['small.log']),
      readLogFileTail: vi.fn().mockResolvedValue({ text: 'x [A] one\ny [B] two', total: 2, truncated: false }),
    });
    await selectFile('small.log');
    await screen.findByText('one');
    expect(screen.queryByText(/Showing the last/i)).toBeNull();
  });

  it('never truncates the live view', async () => {
    window.electronAPI = makeAPI();
    render(<LogPanel isOpen onToggle={vi.fn()} cells={[]} />);
    // live is selected by default; push many entries
    for (let i = 0; i < 20; i++) pushEntry(makeEntry(`live ${i}`));
    expect(screen.queryByText(/Showing the last/i)).toBeNull();
    expect(window.electronAPI.readLogFileTail).not.toHaveBeenCalled();
  });
});
