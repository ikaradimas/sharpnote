import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NotebookParams } from '../../src/components/NotebookParams.jsx';

afterEach(cleanup);

describe('NotebookParams', () => {
  it('renders nothing when there are no params', () => {
    const { container } = render(<NotebookParams params={[]} onChange={() => {}} />);
    expect(container.querySelector('.nb-params-bar')).toBeNull();
  });

  it('emits an updated value on text change', () => {
    const onChange = vi.fn();
    render(<NotebookParams
      params={[{ name: 'Region', type: 'string', default: 'EU' }]}
      onChange={onChange}
    />);
    const input = document.querySelector('.nb-param-input');
    fireEvent.change(input, { target: { value: 'US' } });
    expect(onChange).toHaveBeenCalledWith([
      { name: 'Region', type: 'string', default: 'EU', value: 'US' },
    ]);
  });

  it('shows a per-param reset button only when value differs from default', () => {
    const { rerender } = render(<NotebookParams
      params={[{ name: 'Threshold', type: 'double', default: 0.5 }]}
      onChange={() => {}}
    />);
    expect(document.querySelector('.nb-param-reset')).toBeNull();
    rerender(<NotebookParams
      params={[{ name: 'Threshold', type: 'double', default: 0.5, value: 0.7 }]}
      onChange={() => {}}
    />);
    expect(document.querySelector('.nb-param-reset')).toBeInTheDocument();
  });

  it('reset button drops the value field so default applies again', () => {
    const onChange = vi.fn();
    render(<NotebookParams
      params={[{ name: 'X', type: 'int', default: 1, value: 5 }]}
      onChange={onChange}
    />);
    fireEvent.click(document.querySelector('.nb-param-reset'));
    expect(onChange).toHaveBeenCalledWith([{ name: 'X', type: 'int', default: 1 }]);
  });

  it('renders a dropdown for choice params with the right options', () => {
    render(<NotebookParams
      params={[{ name: 'Env', type: 'choice', default: 'dev', options: ['dev', 'staging', 'prod'] }]}
      onChange={() => {}}
    />);
    const opts = Array.from(document.querySelectorAll('.nb-param-input option')).map((o) => o.value);
    expect(opts).toEqual(['dev', 'staging', 'prod']);
  });
});
