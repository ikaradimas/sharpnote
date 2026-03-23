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
