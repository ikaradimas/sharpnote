import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OutputBlock } from '../../src/renderer.jsx';
import { CellOutput } from '../../src/components/output/OutputBlock.jsx';

const msg = (overrides) => ({ type: 'stdout', content: 'hello', ...overrides });

describe('OutputBlock – stdout', () => {
  it('renders content in .output-stdout', () => {
    render(<OutputBlock msg={msg()} index={0} />);
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(document.querySelector('.output-stdout')).not.toBeNull();
  });

  it('shows export button for stdout', () => {
    render(<OutputBlock msg={msg()} index={0} />);
    expect(document.querySelector('.export-btn')).not.toBeNull();
  });

  it('renders title when provided', () => {
    render(<OutputBlock msg={msg({ title: 'My Title' })} index={0} />);
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(document.querySelector('.output-title')).not.toBeNull();
  });
});

describe('OutputBlock – error', () => {
  it('renders error message', () => {
    const m = msg({ type: 'error', message: 'Oops', stackTrace: 'at line 1' });
    render(<OutputBlock msg={m} index={0} />);
    expect(screen.getByText('Oops')).toBeInTheDocument();
  });

  it('renders stack trace in .output-error-stack', () => {
    const m = msg({ type: 'error', message: 'Err', stackTrace: 'stack here' });
    render(<OutputBlock msg={m} index={0} />);
    expect(screen.getByText('stack here')).toBeInTheDocument();
    expect(document.querySelector('.output-error-stack')).not.toBeNull();
  });

  it('does not render stack div when stackTrace is absent', () => {
    const m = msg({ type: 'error', message: 'Err' });
    render(<OutputBlock msg={m} index={0} />);
    expect(document.querySelector('.output-error-stack')).toBeNull();
  });

  it('does not show export button for error', () => {
    const m = msg({ type: 'error', message: 'Err' });
    render(<OutputBlock msg={m} index={0} />);
    expect(document.querySelector('.export-btn')).toBeNull();
  });
});

describe('OutputBlock – display/html', () => {
  it('renders HTML content in .output-html', () => {
    const m = msg({ type: 'display', format: 'html', content: '<b>bold</b>' });
    render(<OutputBlock msg={m} index={0} />);
    expect(document.querySelector('.output-html')).not.toBeNull();
    expect(document.querySelector('.output-html b')).not.toBeNull();
  });

  it('shows export button for html', () => {
    const m = msg({ type: 'display', format: 'html', content: '<b>x</b>' });
    render(<OutputBlock msg={m} index={0} />);
    expect(document.querySelector('.export-btn')).not.toBeNull();
  });
});

describe('OutputBlock – display/table', () => {
  it('renders DataTable with pagination controls for large sets', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: i, val: `v${i}` }));
    const m = msg({ type: 'display', format: 'table', content: rows });
    render(<OutputBlock msg={m} index={0} />);
    // Table starts collapsed for >5 rows — expand first
    const toggle = document.querySelector('.table-collapse-toggle');
    if (toggle) fireEvent.click(toggle);
    // Pagination controls appear for > 10 rows (default page size)
    expect(document.querySelector('.table-pager')).not.toBeNull();
    expect(document.querySelector('.export-btn')).not.toBeNull();
  });
});

describe('OutputBlock – display/csv', () => {
  it('parses CSV and renders a table', () => {
    const m = msg({ type: 'display', format: 'csv', content: 'name,age\nAlice,30' });
    render(<OutputBlock msg={m} index={0} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(document.querySelector('.export-btn')).not.toBeNull();
  });
});

describe('OutputBlock – display/graph', () => {
  it('renders a canvas element', () => {
    const config = { type: 'bar', data: { labels: [], datasets: [] } };
    const m = msg({ type: 'display', format: 'graph', content: config });
    render(<OutputBlock msg={m} index={0} />);
    expect(document.querySelector('canvas')).not.toBeNull();
    expect(document.querySelector('.export-btn')).not.toBeNull();
  });
});

describe('OutputBlock – interrupted', () => {
  it('renders interrupted message', () => {
    const m = msg({ type: 'interrupted' });
    render(<OutputBlock msg={m} index={0} />);
    expect(screen.getByText(/Execution interrupted/)).toBeInTheDocument();
    expect(document.querySelector('.output-interrupted')).not.toBeNull();
  });

  it('does not show export button for interrupted', () => {
    const m = msg({ type: 'interrupted' });
    render(<OutputBlock msg={m} index={0} />);
    expect(document.querySelector('.export-btn')).toBeNull();
  });
});

describe('OutputBlock – unknown type', () => {
  it('renders nothing for unknown message type', () => {
    const m = msg({ type: 'unknown_type' });
    const { container } = render(<OutputBlock msg={m} index={0} />);
    expect(container.firstChild).toBeNull();
  });
});

// ── CellOutput – multi-result tabs ──────────────────────────────────────────

describe('CellOutput – tabbed results', () => {
  const tableMsg = (rows, title) => ({
    type: 'display',
    format: 'table',
    content: rows,
    ...(title ? { title } : {}),
  });

  const stdoutMsg = (text) => ({ type: 'stdout', content: text });
  const errorMsg = (text) => ({ type: 'error', message: text });

  it('renders tab buttons when 2+ table-format messages are present', () => {
    const messages = [
      tableMsg([{ a: 1 }]),
      tableMsg([{ b: 2 }, { b: 3 }]),
    ];
    const { container } = render(<CellOutput messages={messages} notebookId="nb-1" />);
    const tabs = container.querySelectorAll('.output-tab');
    expect(tabs.length).toBe(2);
  });

  it('tab buttons show "Result N" labels with row counts', () => {
    const messages = [
      tableMsg([{ a: 1 }, { a: 2 }]),
      tableMsg([{ b: 1 }, { b: 2 }, { b: 3 }]),
    ];
    const { container } = render(<CellOutput messages={messages} notebookId="nb-1" />);
    const tabs = container.querySelectorAll('.output-tab');
    expect(tabs[0].textContent).toContain('Result 1');
    expect(tabs[0].querySelector('.output-tab-count').textContent).toBe('2');
    expect(tabs[1].textContent).toContain('Result 2');
    expect(tabs[1].querySelector('.output-tab-count').textContent).toBe('3');
  });

  it('clicking a tab switches the displayed table', () => {
    const messages = [
      tableMsg([{ col: 'first' }]),
      tableMsg([{ col: 'second' }]),
    ];
    const { container } = render(<CellOutput messages={messages} notebookId="nb-1" />);

    // First tab active by default
    expect(screen.getByText('first')).toBeInTheDocument();

    // Click the second tab
    const tabs = container.querySelectorAll('.output-tab');
    fireEvent.click(tabs[1]);
    expect(screen.getByText('second')).toBeInTheDocument();
  });

  it('non-table messages render outside tabs', () => {
    const messages = [
      stdoutMsg('hello stdout'),
      errorMsg('some error'),
      tableMsg([{ a: 1 }]),
      tableMsg([{ b: 2 }]),
    ];
    const { container } = render(<CellOutput messages={messages} notebookId="nb-1" />);
    // stdout and error are rendered outside the tabbed area
    expect(screen.getByText('hello stdout')).toBeInTheDocument();
    expect(screen.getByText('some error')).toBeInTheDocument();
    // Tabs are also present
    expect(container.querySelectorAll('.output-tab').length).toBe(2);
  });

  it('single table message renders without tabs', () => {
    const messages = [tableMsg([{ a: 1 }])];
    const { container } = render(<CellOutput messages={messages} notebookId="nb-1" />);
    expect(container.querySelector('.output-tabbed')).toBeNull();
    expect(container.querySelector('.output-tab-bar')).toBeNull();
    // Table data is still rendered
    expect(screen.getByText('a')).toBeInTheDocument();
  });
});
