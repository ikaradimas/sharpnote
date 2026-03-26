import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PromptWidget } from '../../src/components/output/PromptWidget.jsx';

function makeSpec(overrides = {}) {
  return { requestId: 'req-xyz', message: 'Enter your name:', title: 'Input', defaultValue: '', ...overrides };
}

describe('PromptWidget', () => {
  beforeEach(() => {
    window.electronAPI = { sendToKernel: vi.fn() };
  });

  it('renders message and title while pending', () => {
    render(<PromptWidget spec={makeSpec()} notebookId="nb1" />);
    expect(screen.getByText('Enter your name:')).toBeInTheDocument();
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders without title when not provided', () => {
    render(<PromptWidget spec={makeSpec({ title: undefined })} notebookId="nb1" />);
    expect(screen.getByText('Enter your name:')).toBeInTheDocument();
    expect(screen.queryByText('Input')).not.toBeInTheDocument();
  });

  it('prefills input with defaultValue', () => {
    render(<PromptWidget spec={makeSpec({ defaultValue: 'Alice' })} notebookId="nb1" />);
    expect(screen.getByRole('textbox').value).toBe('Alice');
  });

  it('clicking OK sends prompt_response with value', () => {
    render(<PromptWidget spec={makeSpec({ defaultValue: 'Bob' })} notebookId="nb1" />);
    fireEvent.click(screen.getByText('OK'));
    expect(window.electronAPI.sendToKernel).toHaveBeenCalledWith('nb1', {
      type: 'prompt_response',
      requestId: 'req-xyz',
      value: 'Bob',
    });
  });

  it('clicking Cancel sends prompt_response with null', () => {
    render(<PromptWidget spec={makeSpec()} notebookId="nb1" />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(window.electronAPI.sendToKernel).toHaveBeenCalledWith('nb1', {
      type: 'prompt_response',
      requestId: 'req-xyz',
      value: null,
    });
  });

  it('transitions to submitted state after OK', () => {
    render(<PromptWidget spec={makeSpec({ defaultValue: 'test' })} notebookId="nb1" />);
    fireEvent.click(screen.getByText('OK'));
    expect(screen.getByText('✓ "test"')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('transitions to cancelled state after Cancel', () => {
    render(<PromptWidget spec={makeSpec()} notebookId="nb1" />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('✕ Cancelled')).toBeInTheDocument();
  });
});
