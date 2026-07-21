import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VarInspectorPopup } from '../../src/components/dialogs/VarInspectorPopup.jsx';

function makeProps(overrides = {}) {
  return {
    notebookId: 'nb1',
    varName: 'greeting',
    typeName: 'String',
    inScope: true,
    varsVersion: 1,
    payload: { format: 'html', content: '<pre>hello world</pre>' },
    isNull: false,
    error: null,
    loading: false,
    initialPos: { x: 100, y: 100 },
    onRequest: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('VarInspectorPopup', () => {
  it('renders the variable name and type', () => {
    render(<VarInspectorPopup {...makeProps()} />);
    expect(screen.getByText('greeting')).toBeInTheDocument();
    expect(screen.getByText('String')).toBeInTheDocument();
  });

  it('renders the display payload through FormatContent (html)', () => {
    const { container } = render(<VarInspectorPopup {...makeProps()} />);
    expect(container.innerHTML).toContain('hello world');
  });

  it('requests the payload on mount', () => {
    const onRequest = vi.fn();
    render(<VarInspectorPopup {...makeProps({ onRequest })} />);
    expect(onRequest).toHaveBeenCalledWith('nb1', 'greeting');
  });

  it('does NOT request when the variable is out of scope', () => {
    const onRequest = vi.fn();
    render(<VarInspectorPopup {...makeProps({ inScope: false, onRequest })} />);
    expect(onRequest).not.toHaveBeenCalled();
    expect(screen.getByText(/not in scope/i)).toBeInTheDocument();
  });

  it('re-requests when varsVersion changes (live refresh on execution)', () => {
    const onRequest = vi.fn();
    const { rerender } = render(<VarInspectorPopup {...makeProps({ varsVersion: 1, onRequest })} />);
    expect(onRequest).toHaveBeenCalledTimes(1);
    rerender(<VarInspectorPopup {...makeProps({ varsVersion: 2, onRequest })} />);
    expect(onRequest).toHaveBeenCalledTimes(2);
  });

  it('shows null indicator when isNull', () => {
    render(<VarInspectorPopup {...makeProps({ isNull: true, payload: null })} />);
    expect(document.querySelector('.var-null')).toBeInTheDocument();
  });

  it('shows an error message when error is set', () => {
    render(<VarInspectorPopup {...makeProps({ error: 'boom', payload: null })} />);
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<VarInspectorPopup {...makeProps({ onClose })} />);
    screen.getByTitle('Close').click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
