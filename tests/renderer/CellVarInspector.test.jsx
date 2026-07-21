import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CellVarInspector } from '../../src/components/editor/CellVarInspector.jsx';

const VARS = [
  { name: 'nums', typeName: 'Int32[]', value: '[1, 2, 3]' },
  { name: 'other', typeName: 'String', value: 'x' },
];

describe('CellVarInspector', () => {
  it('lists only the variables the cell declares', () => {
    // content declares `nums` but merely references `other`
    render(<CellVarInspector content="var nums = new[]{1,2,3}; Use(other);" vars={VARS} onInspect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Inspect variables/ }));
    expect(screen.getByText('nums')).toBeInTheDocument();
    expect(screen.queryByText('other')).toBeNull();
  });

  it('calls onInspect with the variable name and type', () => {
    const onInspect = vi.fn();
    render(<CellVarInspector content="var nums = new[]{1,2,3};" vars={VARS} onInspect={onInspect} />);
    fireEvent.click(screen.getByRole('button', { name: /Inspect variables/ }));
    fireEvent.click(screen.getByText('nums'));
    expect(onInspect).toHaveBeenCalledWith('nums', 'Int32[]');
  });

  it('disables the button when the cell declares no in-scope variables', () => {
    render(<CellVarInspector content="Console.WriteLine(42);" vars={VARS} onInspect={vi.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
