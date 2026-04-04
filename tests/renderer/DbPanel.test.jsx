import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DbPanel } from '../../src/components/panels/db/DbPanel.jsx';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CONN_SQLITE = {
  id: 'conn-1',
  name: 'TestDB',
  provider: 'sqlite',
  connectionString: 'Data Source=test.db',
};

const CONN_POSTGRES = {
  id: 'conn-2',
  name: 'ProdDB',
  provider: 'postgresql',
  connectionString: 'Host=localhost;Database=prod',
};

const SCHEMA = {
  tables: [
    {
      schema: 'main',
      name: 'Users',
      columns: [
        { name: 'Id', csharpType: 'int', isPrimaryKey: true },
        { name: 'Name', csharpType: 'string', isPrimaryKey: false },
        { name: 'Email', csharpType: 'string', isPrimaryKey: false },
      ],
    },
    {
      schema: 'main',
      name: 'Orders',
      columns: [
        { name: 'OrderId', csharpType: 'int', isPrimaryKey: true },
        { name: 'UserId', csharpType: 'int', isPrimaryKey: false },
      ],
    },
  ],
};

const ATTACHED_READY = {
  connectionId: 'conn-1',
  status: 'ready',
  varName: 'db',
  schema: SCHEMA,
};

const ATTACHED_ERROR = {
  connectionId: 'conn-2',
  status: 'error',
  varName: 'prod',
  error: 'Connection refused',
  schema: null,
};

const ATTACHED_CONNECTING = {
  connectionId: 'conn-2',
  status: 'connecting',
  varName: 'prod',
  schema: null,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultProps(overrides = {}) {
  return {
    isOpen: true,
    onToggle: vi.fn(),
    connections: [CONN_SQLITE, CONN_POSTGRES],
    attachedDbs: [],
    notebookId: 'nb-1',
    onAttach: vi.fn(),
    onDetach: vi.fn(),
    onRefresh: vi.fn(),
    onRetry: vi.fn(),
    onEditConnection: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.confirm = vi.fn().mockReturnValue(true);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DbPanel', () => {
  // ── Rendering ────────────────────────────────────────────────────────────

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<DbPanel {...defaultProps({ isOpen: false })} />);
    expect(container.querySelector('.db-panel')).toBeNull();
  });

  it('renders the panel when isOpen is true', () => {
    const { container } = render(<DbPanel {...defaultProps()} />);
    expect(container.querySelector('.db-panel')).not.toBeNull();
    expect(screen.getByText('Databases')).toBeInTheDocument();
  });

  it('lists all connections in the left column', () => {
    render(<DbPanel {...defaultProps()} />);
    expect(screen.getByText('TestDB')).toBeInTheDocument();
    expect(screen.getByText('ProdDB')).toBeInTheDocument();
  });

  it('shows empty message when no connections exist', () => {
    render(<DbPanel {...defaultProps({ connections: [] })} />);
    expect(screen.getByText(/No connections/)).toBeInTheDocument();
  });

  it('shows empty message when no databases are attached', () => {
    render(<DbPanel {...defaultProps()} />);
    expect(screen.getByText(/No databases attached/)).toBeInTheDocument();
  });

  // ── Attach / Detach ──────────────────────────────────────────────────────

  it('shows Attach button for unattached connections', () => {
    render(<DbPanel {...defaultProps()} />);
    const btns = screen.getAllByTitle('Attach to notebook');
    expect(btns).toHaveLength(2);
  });

  it('calls onAttach when Attach button is clicked', () => {
    const props = defaultProps();
    render(<DbPanel {...props} />);
    fireEvent.click(screen.getAllByTitle('Attach to notebook')[0]);
    expect(props.onAttach).toHaveBeenCalledWith('conn-1');
  });

  it('shows Detach button for attached connections', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    expect(screen.getByTitle('Detach')).toBeInTheDocument();
  });

  it('calls onDetach when Detach button is clicked', () => {
    const props = defaultProps({ attachedDbs: [ATTACHED_READY] });
    render(<DbPanel {...props} />);
    fireEvent.click(screen.getByTitle('Detach'));
    expect(props.onDetach).toHaveBeenCalledWith('conn-1');
  });

  it('highlights attached connections with the attached class', () => {
    const { container } = render(
      <DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />
    );
    const items = container.querySelectorAll('.db-connection-item');
    expect(items[0].classList.contains('db-connection-attached')).toBe(true);
    expect(items[1].classList.contains('db-connection-attached')).toBe(false);
  });

  // ── Schema tree ──────────────────────────────────────────────────────────

  it('renders the schema tree for attached databases', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    expect(screen.getByText('main.Users')).toBeInTheDocument();
    expect(screen.getByText('main.Orders')).toBeInTheDocument();
  });

  it('shows column count badges', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    const badges = document.querySelectorAll('.db-col-count');
    const counts = [...badges].map((b) => b.textContent);
    expect(counts).toContain('3'); // Users
    expect(counts).toContain('2'); // Orders
  });

  it('expands a table to show columns when clicked', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    expect(document.querySelector('.db-columns-list')).toBeNull();

    fireEvent.click(screen.getByText('main.Users'));
    const cols = document.querySelectorAll('.db-columns-list .db-column-node');
    expect(cols).toHaveLength(3);
    expect(screen.getByText('Id')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('collapses an expanded table when clicked again', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    fireEvent.click(screen.getByText('main.Users'));
    expect(document.querySelector('.db-columns-list')).not.toBeNull();

    fireEvent.click(screen.getByText('main.Users'));
    expect(document.querySelector('.db-columns-list')).toBeNull();
  });

  it('marks primary key columns with PK badge', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    fireEvent.click(screen.getByText('main.Users'));
    expect(screen.getByText('PK')).toBeInTheDocument();
    expect(document.querySelector('.db-col-pk')).not.toBeNull();
  });

  // ── Collapsible DB sections ──────────────────────────────────────────────

  it('collapses the entire table list when the DB header is clicked', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    expect(screen.getByText('main.Users')).toBeInTheDocument();

    // Click the schema header to collapse
    const header = document.querySelector('.db-schema-header');
    fireEvent.click(header);
    expect(screen.queryByText('main.Users')).toBeNull();
  });

  it('re-expands the table list when the DB header is clicked again', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    const header = document.querySelector('.db-schema-header');

    fireEvent.click(header); // collapse
    expect(screen.queryByText('main.Users')).toBeNull();

    fireEvent.click(header); // expand
    expect(screen.getByText('main.Users')).toBeInTheDocument();
  });

  it('shows collapse arrow on DB schema headers', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    const arrow = document.querySelector('.db-schema-header .db-table-arrow');
    expect(arrow).not.toBeNull();
    expect(arrow.textContent).toBe('▾'); // expanded by default
  });

  it('toggles arrow direction on collapse', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    const header = document.querySelector('.db-schema-header');
    const arrow = header.querySelector('.db-table-arrow');

    fireEvent.click(header);
    expect(arrow.textContent).toBe('▸'); // collapsed

    fireEvent.click(header);
    expect(arrow.textContent).toBe('▾'); // expanded
  });

  it('collapses databases independently', () => {
    render(
      <DbPanel {...defaultProps({
        attachedDbs: [ATTACHED_READY, { ...ATTACHED_ERROR, schema: { tables: [SCHEMA.tables[1]] } }],
      })} />
    );
    const headers = document.querySelectorAll('.db-schema-header');

    // Collapse first DB only
    fireEvent.click(headers[0]);
    expect(screen.queryByText('main.Users')).toBeNull();
    expect(screen.getByText('main.Orders')).toBeInTheDocument();
  });

  // ── Scroll into view ─────────────────────────────────────────────────────

  it('scrolls to schema section when clicking an attached connection', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    const section = document.querySelector('.db-schema-section');
    section.scrollIntoView = vi.fn();

    const connItem = document.querySelector('.db-connections-col .db-connection-attached');
    fireEvent.click(connItem);

    expect(section.scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
      behavior: 'smooth',
    });
  });

  it('does not scroll when clicking an unattached connection', () => {
    render(<DbPanel {...defaultProps()} />);
    const connItem = screen.getByText('TestDB').closest('.db-connection-item');
    fireEvent.click(connItem);

    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  // ── Refresh / Retry ──────────────────────────────────────────────────────

  it('calls onRefresh when the refresh button is clicked', () => {
    const props = defaultProps({ attachedDbs: [ATTACHED_READY] });
    render(<DbPanel {...props} />);
    fireEvent.click(screen.getByTitle('Refresh schema'));
    expect(props.onRefresh).toHaveBeenCalledWith('conn-1');
  });

  it('refresh button does not collapse the DB section', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    expect(screen.getByText('main.Users')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Refresh schema'));
    // Tables should still be visible (not collapsed)
    expect(screen.getByText('main.Users')).toBeInTheDocument();
  });

  it('disables refresh when status is connecting', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_CONNECTING] })} />);
    expect(screen.getByTitle('Refresh schema')).toBeDisabled();
  });

  it('shows error message and retry button on error', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_ERROR] })} />);
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
    expect(screen.getByText('↺ Retry')).toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', () => {
    const props = defaultProps({ attachedDbs: [ATTACHED_ERROR] });
    render(<DbPanel {...props} />);
    fireEvent.click(screen.getByText('↺ Retry'));
    expect(props.onRetry).toHaveBeenCalledWith('conn-2');
  });

  it('hides error message when DB section is collapsed', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_ERROR] })} />);
    expect(screen.getByText('Connection refused')).toBeInTheDocument();

    fireEvent.click(document.querySelector('.db-schema-header'));
    expect(screen.queryByText('Connection refused')).toBeNull();
  });

  // ── Close ────────────────────────────────────────────────────────────────

  it('calls onToggle when close button is clicked', () => {
    const props = defaultProps();
    render(<DbPanel {...props} />);
    fireEvent.click(screen.getByTitle('Close'));
    expect(props.onToggle).toHaveBeenCalledOnce();
  });

  // ── Remove connection ──────────────────────────────────────────────────

  it('calls onRemove after confirm when remove button is clicked', () => {
    const props = defaultProps();
    render(<DbPanel {...props} />);
    fireEvent.click(screen.getAllByTitle('Remove')[0]);
    expect(window.confirm).toHaveBeenCalled();
    expect(props.onRemove).toHaveBeenCalledWith('conn-1');
  });

  it('does not call onRemove when confirm is cancelled', () => {
    window.confirm = vi.fn().mockReturnValue(false);
    const props = defaultProps();
    render(<DbPanel {...props} />);
    fireEvent.click(screen.getAllByTitle('Remove')[0]);
    expect(props.onRemove).not.toHaveBeenCalled();
  });

  // ── Connection dialog trigger ───────────────────────────────────────────

  it('calls onEditConnection(null) when + Add is clicked', () => {
    const props = defaultProps();
    render(<DbPanel {...props} />);
    fireEvent.click(screen.getByTitle('Add connection'));
    expect(props.onEditConnection).toHaveBeenCalledWith(null);
  });

  it('calls onEditConnection(conn) when edit button is clicked', () => {
    const props = defaultProps();
    render(<DbPanel {...props} />);
    fireEvent.click(screen.getAllByTitle('Edit')[0]);
    expect(props.onEditConnection).toHaveBeenCalledWith(CONN_SQLITE);
  });

  // ── VarBadge ───────────────────────────────────────────────────────────

  it('shows the variable name badge for attached databases', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    expect(document.querySelector('.db-var-badge')).not.toBeNull();
    expect(document.querySelector('.db-var-badge').textContent).toContain('db');
  });

  // ── Schema filter ───────────────────────────────────────────────────────

  it('schema tree shows search input for relational databases', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    expect(screen.getByPlaceholderText('Filter tables / columns…')).toBeInTheDocument();
  });

  it('typing in search filters tables by name', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    const input = screen.getByPlaceholderText('Filter tables / columns…');
    fireEvent.change(input, { target: { value: 'Users' } });
    expect(screen.getByText('main.Users')).toBeInTheDocument();
    expect(screen.queryByText('main.Orders')).toBeNull();
  });

  it('typing in search filters by column name match', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    const input = screen.getByPlaceholderText('Filter tables / columns…');
    // "Email" is a column in Users, not in Orders
    fireEvent.change(input, { target: { value: 'Email' } });
    expect(screen.getByText('main.Users')).toBeInTheDocument();
    expect(screen.queryByText('main.Orders')).toBeNull();
  });

  it('clearing search shows all tables', () => {
    render(<DbPanel {...defaultProps({ attachedDbs: [ATTACHED_READY] })} />);
    const input = screen.getByPlaceholderText('Filter tables / columns…');

    // Filter first
    fireEvent.change(input, { target: { value: 'Users' } });
    expect(screen.queryByText('main.Orders')).toBeNull();

    // Clear the filter
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByText('main.Users')).toBeInTheDocument();
    expect(screen.getByText('main.Orders')).toBeInTheDocument();
  });
});
