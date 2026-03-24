import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VarInspectDialog } from '../../src/renderer.jsx';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeProps(overrides = {}) {
  return {
    name: 'myVar',
    typeName: 'Int32',
    value: '42',
    fullValue: null,
    onLoadFull: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('VarInspectDialog — rendering', () => {
  it('renders variable name and type', () => {
    render(<VarInspectDialog {...makeProps()} />);
    expect(screen.getByText('myVar')).toBeInTheDocument();
    expect(screen.getByText('Int32')).toBeInTheDocument();
  });

  it('renders the value', () => {
    render(<VarInspectDialog {...makeProps({ value: '99' })} />);
    expect(screen.getByText('99')).toBeInTheDocument();
  });

  it('renders null indicator when value is falsy', () => {
    render(<VarInspectDialog {...makeProps({ value: '', fullValue: null })} />);
    expect(document.querySelector('.var-null')).toBeInTheDocument();
  });

  it('renders close button', () => {
    render(<VarInspectDialog {...makeProps()} />);
    expect(screen.getByTitle('Close')).toBeInTheDocument();
  });
});

// ── Full value ─────────────────────────────────────────────────────────────────

describe('VarInspectDialog — full value', () => {
  it('shows fullValue when provided instead of value', () => {
    render(<VarInspectDialog {...makeProps({ value: 'trunc...', fullValue: '{"complete":"json"}' })} />);
    expect(screen.getByText('{"complete":"json"}')).toBeInTheDocument();
    expect(screen.queryByText('trunc...')).toBeNull();
  });

  it('shows "Load Full Value" button when fullValue is null', () => {
    render(<VarInspectDialog {...makeProps()} />);
    expect(screen.getByText('Load Full Value')).toBeInTheDocument();
  });

  it('hides "Load Full Value" button when fullValue is present', () => {
    render(<VarInspectDialog {...makeProps({ fullValue: 'full data' })} />);
    expect(screen.queryByText('Load Full Value')).toBeNull();
  });

  it('calls onLoadFull when "Load Full Value" is clicked', () => {
    const props = makeProps();
    render(<VarInspectDialog {...props} />);
    fireEvent.click(screen.getByText('Load Full Value'));
    expect(props.onLoadFull).toHaveBeenCalledOnce();
  });
});

// ── Truncation warning ────────────────────────────────────────────────────────

describe('VarInspectDialog — truncation warning', () => {
  it('shows truncation message when value is ≥119 chars and fullValue is null', () => {
    render(<VarInspectDialog {...makeProps({ value: 'x'.repeat(119) })} />);
    expect(screen.getByText(/Value may be truncated/)).toBeInTheDocument();
  });

  it('hides truncation message when value is <119 chars', () => {
    render(<VarInspectDialog {...makeProps({ value: 'x'.repeat(118) })} />);
    expect(screen.queryByText(/Value may be truncated/)).toBeNull();
  });

  it('hides truncation message when fullValue is already loaded', () => {
    render(<VarInspectDialog {...makeProps({ value: 'x'.repeat(119), fullValue: 'full' })} />);
    expect(screen.queryByText(/Value may be truncated/)).toBeNull();
  });
});

// ── Copy button ────────────────────────────────────────────────────────────────

describe('VarInspectDialog — copy', () => {
  it('renders Copy button', () => {
    render(<VarInspectDialog {...makeProps()} />);
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('shows "Copied!" after clicking Copy', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    render(<VarInspectDialog {...makeProps()} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Copy'));
    });
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });
});

// ── Close behaviour ───────────────────────────────────────────────────────────

describe('VarInspectDialog — close behaviour', () => {
  it('calls onClose when close button is clicked', () => {
    const props = makeProps();
    render(<VarInspectDialog {...props} />);
    fireEvent.click(screen.getByTitle('Close'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when overlay backdrop is clicked', () => {
    const props = makeProps();
    const { container } = render(<VarInspectDialog {...props} />);
    fireEvent.click(container.querySelector('.var-inspect-overlay'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose when clicking inside the dialog', () => {
    const props = makeProps();
    const { container } = render(<VarInspectDialog {...props} />);
    fireEvent.click(container.querySelector('.var-inspect-dialog'));
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
