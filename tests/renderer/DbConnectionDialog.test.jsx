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
});
