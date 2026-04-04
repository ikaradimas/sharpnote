import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DbConnectionDialog } from '../../src/components/dialogs/DbConnectionDialog.jsx';

function defaultProps(overrides = {}) {
  return {
    connection: null,
    existingNames: [],
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('DbConnectionDialog', () => {
  it('shows "Add Connection" title for new connections', () => {
    render(<DbConnectionDialog {...defaultProps()} />);
    expect(screen.getByText('Add Connection')).toBeInTheDocument();
  });

  it('shows "Edit Connection" title when editing', () => {
    render(<DbConnectionDialog {...defaultProps({
      connection: { id: '1', name: 'TestDB', provider: 'sqlite', connectionString: 'Data Source=test.db' },
    })} />);
    expect(screen.getByText('Edit Connection')).toBeInTheDocument();
  });

  it('prefills fields when editing an existing connection', () => {
    render(<DbConnectionDialog {...defaultProps({
      connection: { id: '1', name: 'TestDB', provider: 'sqlite', connectionString: 'Data Source=test.db' },
    })} />);
    expect(screen.getByPlaceholderText('Connection name').value).toBe('TestDB');
  });

  it('calls onSave and onClose when Save is clicked with valid data', () => {
    const props = defaultProps();
    render(<DbConnectionDialog {...props} />);

    fireEvent.change(screen.getByPlaceholderText('Connection name'), {
      target: { value: 'NewDB' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Data Source/), {
      target: { value: 'Data Source=new.db' },
    });
    fireEvent.click(screen.getByText('Save'));

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'NewDB', provider: 'sqlite', connectionString: 'Data Source=new.db' })
    );
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Cancel is clicked', () => {
    const props = defaultProps();
    render(<DbConnectionDialog {...props} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('closes when clicking the overlay', () => {
    const props = defaultProps();
    const { container } = render(<DbConnectionDialog {...props} />);
    fireEvent.click(container.querySelector('.settings-overlay'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('does not close when clicking inside the dialog', () => {
    const props = defaultProps();
    render(<DbConnectionDialog {...props} />);
    fireEvent.click(document.querySelector('.db-conn-dialog'));
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('shows error for duplicate connection name', () => {
    render(<DbConnectionDialog {...defaultProps({ existingNames: ['TestDB'] })} />);

    fireEvent.change(screen.getByPlaceholderText('Connection name'), {
      target: { value: 'TestDB' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Data Source/), {
      target: { value: 'something' },
    });
    fireEvent.click(screen.getByText('Save'));

    expect(screen.getByText(/already exists/)).toBeInTheDocument();
  });

  it('does not call onSave when name is empty', () => {
    const props = defaultProps();
    render(<DbConnectionDialog {...props} />);
    fireEvent.click(screen.getByText('Save'));
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('closes via the close button', () => {
    const props = defaultProps();
    render(<DbConnectionDialog {...props} />);
    fireEvent.click(screen.getByTitle('Close'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  // ── Test connection button ──────────────────────────────────────────────

  it('renders Test button when onTestConnection is provided', () => {
    render(<DbConnectionDialog {...defaultProps({ onTestConnection: vi.fn() })} />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('does not render Test button when onTestConnection is not provided', () => {
    render(<DbConnectionDialog {...defaultProps()} />);
    expect(screen.queryByText('Test')).toBeNull();
  });

  it('clicking Test calls onTestConnection with provider and connection string', async () => {
    const onTest = vi.fn().mockResolvedValue({ success: true });
    render(<DbConnectionDialog {...defaultProps({ onTestConnection: onTest })} />);

    fireEvent.change(screen.getByPlaceholderText(/Data Source/), {
      target: { value: 'Data Source=my.db' },
    });
    fireEvent.click(screen.getByText('Test'));

    expect(onTest).toHaveBeenCalledWith('sqlite', 'Data Source=my.db');
  });

  it('shows "Testing connection..." during test', async () => {
    // Create a promise that we control
    let resolveTest;
    const onTest = vi.fn().mockReturnValue(new Promise((r) => { resolveTest = r; }));
    render(<DbConnectionDialog {...defaultProps({ onTestConnection: onTest })} />);

    fireEvent.change(screen.getByPlaceholderText(/Data Source/), {
      target: { value: 'Data Source=my.db' },
    });
    fireEvent.click(screen.getByText('Test'));

    expect(screen.getByText(/Testing connection/)).toBeInTheDocument();
    // Resolve to clean up
    resolveTest({ success: true });
  });

  it('shows success message on successful test', async () => {
    const onTest = vi.fn().mockResolvedValue({ success: true });
    render(<DbConnectionDialog {...defaultProps({ onTestConnection: onTest })} />);

    fireEvent.change(screen.getByPlaceholderText(/Data Source/), {
      target: { value: 'Data Source=my.db' },
    });
    fireEvent.click(screen.getByText('Test'));

    // Wait for the async result
    await screen.findByText(/Connection successful/);
    expect(screen.getByText(/Connection successful/)).toBeInTheDocument();
  });

  it('shows error message on failed test', async () => {
    const onTest = vi.fn().mockResolvedValue({ success: false, message: 'Bad credentials' });
    render(<DbConnectionDialog {...defaultProps({ onTestConnection: onTest })} />);

    fireEvent.change(screen.getByPlaceholderText(/Data Source/), {
      target: { value: 'Data Source=my.db' },
    });
    fireEvent.click(screen.getByText('Test'));

    // The error message is rendered alongside a "✗ " prefix in the same container
    await screen.findByText(/Bad credentials/);
    expect(screen.getByText(/Bad credentials/)).toBeInTheDocument();
  });
});
