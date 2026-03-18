import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VarsPanel } from '../../src/renderer.jsx';

const makeVars = () => [
  { name: 'myInt', typeName: 'Int32', value: '42', isNull: false },
  { name: 'myStr', typeName: 'String', value: 'hello', isNull: false },
  { name: 'nullVar', typeName: 'Object', value: 'null', isNull: true },
];

describe('VarsPanel', () => {
  it('renders all variables', () => {
    render(<VarsPanel vars={makeVars()} />);
    expect(screen.getByText('myInt')).toBeInTheDocument();
    expect(screen.getByText('myStr')).toBeInTheDocument();
  });

  it('shows empty state when no variables', () => {
    render(<VarsPanel vars={[]} />);
    expect(screen.getByText(/No variables in scope/)).toBeInTheDocument();
  });

  it('shows "No matches" when search yields nothing', () => {
    render(<VarsPanel vars={makeVars()} />);
    const input = screen.getByPlaceholderText('filter…');
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('filters by variable name', () => {
    render(<VarsPanel vars={makeVars()} />);
    const input = screen.getByPlaceholderText('filter…');
    fireEvent.change(input, { target: { value: 'myInt' } });
    expect(screen.getByText('myInt')).toBeInTheDocument();
    expect(screen.queryByText('myStr')).toBeNull();
  });

  it('filters by type name', () => {
    render(<VarsPanel vars={makeVars()} />);
    const input = screen.getByPlaceholderText('filter…');
    fireEvent.change(input, { target: { value: 'Int32' } });
    expect(screen.getByText('myInt')).toBeInTheDocument();
    expect(screen.queryByText('myStr')).toBeNull();
  });

  it('shows null badge for null variables', () => {
    render(<VarsPanel vars={makeVars()} />);
    expect(screen.getByText('null')).toBeInTheDocument();
    expect(document.querySelector('.vars-null')).not.toBeNull();
  });

  it('renders type badge for each variable', () => {
    render(<VarsPanel vars={makeVars()} />);
    expect(screen.getByText('Int32')).toBeInTheDocument();
    expect(screen.getByText('String')).toBeInTheDocument();
  });
});
