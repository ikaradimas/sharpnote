import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OutputBlock } from '../../src/renderer.jsx';

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
    // Pagination controls appear for > 20 rows
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
