import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConfirmWidget } from '../../src/components/output/ConfirmWidget.jsx';

function makeSpec(overrides = {}) {
  return { requestId: 'req-abc', message: 'Delete all records?', title: 'Confirm', ...overrides };
}

describe('ConfirmWidget', () => {
  beforeEach(() => {
    window.electronAPI = { sendToKernel: vi.fn() };
  });

  it('renders message and title while pending', () => {
    render(<ConfirmWidget spec={makeSpec()} notebookId="nb1" />);
    expect(screen.getByText('Delete all records?')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('renders without title when not provided', () => {
    render(<ConfirmWidget spec={makeSpec({ title: undefined })} notebookId="nb1" />);
    expect(screen.getByText('Delete all records?')).toBeInTheDocument();
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
  });

  it('clicking OK sends confirm_response with confirmed=true', () => {
    render(<ConfirmWidget spec={makeSpec()} notebookId="nb1" />);
    fireEvent.click(screen.getByText('OK'));
    expect(window.electronAPI.sendToKernel).toHaveBeenCalledWith('nb1', {
      type: 'confirm_response',
      requestId: 'req-abc',
      confirmed: true,
    });
  });

  it('clicking Cancel sends confirm_response with confirmed=false', () => {
    render(<ConfirmWidget spec={makeSpec()} notebookId="nb1" />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(window.electronAPI.sendToKernel).toHaveBeenCalledWith('nb1', {
      type: 'confirm_response',
      requestId: 'req-abc',
      confirmed: false,
    });
  });

  it('transitions to confirmed state after OK', () => {
    render(<ConfirmWidget spec={makeSpec()} notebookId="nb1" />);
    fireEvent.click(screen.getByText('OK'));
    expect(screen.getByText('✓ Confirmed')).toBeInTheDocument();
    expect(screen.queryByText('OK')).not.toBeInTheDocument();
  });

  it('transitions to cancelled state after Cancel', () => {
    render(<ConfirmWidget spec={makeSpec()} notebookId="nb1" />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('✕ Cancelled')).toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });
});
