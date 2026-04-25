import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TreeMapOutput } from '../../src/components/output/TreeMapOutput.jsx';

afterEach(cleanup);

describe('TreeMapOutput', () => {
  it('renders one rect per leaf with sizes proportional to value', () => {
    const { container } = render(<TreeMapOutput spec={{
      name: 'Root',
      children: [
        { name: 'Big',    value: 60 },
        { name: 'Medium', value: 30 },
        { name: 'Small',  value: 10 },
      ],
      width: 400, height: 200,
    }} />);

    const rects = Array.from(container.querySelectorAll('rect'));
    expect(rects).toHaveLength(3);

    const areas = rects.map((r) => parseFloat(r.getAttribute('width')) * parseFloat(r.getAttribute('height')));
    // Largest rect must correspond to the leaf with the largest value.
    const sortedAreas = [...areas].sort((a, b) => b - a);
    expect(areas[0]).toBe(sortedAreas[0]);
    expect(areas[2]).toBe(sortedAreas[2]);
    // The 'Big' (60) leaf should have at least 4× the area of 'Small' (10),
    // allowing slack for treemap padding/rounding.
    expect(areas[0] / areas[2]).toBeGreaterThan(4);
  });

  it('handles deeply nested specs (sums children values)', () => {
    const { container } = render(<TreeMapOutput spec={{
      name: 'Root',
      children: [
        { name: 'Branch', children: [
          { name: 'A', value: 5 },
          { name: 'B', value: 5 },
        ]},
        { name: 'Leaf', value: 20 },
      ],
      width: 200, height: 200,
    }} />);

    expect(container.querySelectorAll('rect')).toHaveLength(3);
  });

  it('shows an empty-state message when no leaves', () => {
    const { container } = render(<TreeMapOutput spec={{ name: 'Empty' }} />);
    expect(container.querySelector('.output-treemap-empty')).toBeInTheDocument();
  });
});
