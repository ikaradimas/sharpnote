import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AboutDialog } from '../../src/components/dialogs/AboutDialog.jsx';

beforeEach(() => {
  window.electronAPI = {
    getAppVersion: vi.fn().mockResolvedValue('1.13.0'),
  };
});

describe('AboutDialog', () => {
  it('renders the app name', () => {
    render(<AboutDialog onClose={vi.fn()} />);
    expect(screen.getByText('SharpNote')).toBeInTheDocument();
  });

  it('renders the logo tile', () => {
    render(<AboutDialog onClose={vi.fn()} />);
    expect(document.querySelector('.about-logo')).toBeInTheDocument();
  });

  it('shows version after API resolves', async () => {
    render(<AboutDialog onClose={vi.fn()} />);
    expect(await screen.findByText('v1.13.0')).toBeInTheDocument();
  });

  it('shows placeholder version before API resolves', () => {
    window.electronAPI.getAppVersion = vi.fn(() => new Promise(() => {})); // never resolves
    render(<AboutDialog onClose={vi.fn()} />);
    expect(screen.getByText('v…')).toBeInTheDocument();
  });

  it('renders .NET 10 in the stack', () => {
    render(<AboutDialog onClose={vi.fn()} />);
    expect(screen.getByText('.NET 10')).toBeInTheDocument();
  });

  it('renders all expected tech pills', () => {
    render(<AboutDialog onClose={vi.fn()} />);
    for (const label of ['Electron', 'React 18', '.NET 10', 'Roslyn', 'CodeMirror 6', 'Chart.js']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('calls onClose when Close button is clicked', () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);
    fireEvent.click(document.querySelector('.quit-overlay'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close when dialog body is clicked', () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);
    fireEvent.click(document.querySelector('.about-dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows app icon', () => {
    render(<AboutDialog onClose={vi.fn()} />);
    const img = document.querySelector('.about-logo');
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
  });
});
