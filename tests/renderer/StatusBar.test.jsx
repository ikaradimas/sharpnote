import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusBar } from '../../src/app/StatusBar.jsx';

// A minimal notebook-id-shaped id (StatusBar uses isNotebookId to pick the active nb).
const NB_ID = 'nb00000001';

function nb(overrides = {}) {
  return {
    id: NB_ID,
    memoryHistory: [{ mb: 1500, gc: false }],
    running: new Set(),
    cells: [],
    isDirty: false,
    ...overrides,
  };
}

describe('StatusBar — memory-pressure warning', () => {
  it('shows current memory and no warning when memoryWarning is unset', () => {
    render(<StatusBar notebooks={[nb()]} activeId={NB_ID} />);
    expect(screen.getByText(/1500\.0 MB/)).toBeInTheDocument();
    expect(document.querySelector('.status-mem-warning')).toBeNull();
  });

  it('renders a clickable Restart button when memoryWarning is set and onRestartKernel provided', () => {
    const onRestartKernel = vi.fn();
    render(
      <StatusBar
        notebooks={[nb({ memoryWarning: 'Kernel memory: 1500 MB' })]}
        activeId={NB_ID}
        onRestartKernel={onRestartKernel}
      />
    );
    const btn = document.querySelector('.status-mem-warning-btn');
    expect(btn).not.toBeNull();
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.textContent).toContain('Kernel memory: 1500 MB');
    expect(btn.textContent).toContain('Restart');
    fireEvent.click(btn);
    expect(onRestartKernel).toHaveBeenCalledOnce();
  });

  it('falls back to a non-interactive warning when no onRestartKernel is provided', () => {
    render(
      <StatusBar
        notebooks={[nb({ memoryWarning: 'Kernel memory: 1500 MB' })]}
        activeId={NB_ID}
      />
    );
    expect(document.querySelector('.status-mem-warning')).not.toBeNull();
    expect(document.querySelector('.status-mem-warning-btn')).toBeNull();
  });
});
