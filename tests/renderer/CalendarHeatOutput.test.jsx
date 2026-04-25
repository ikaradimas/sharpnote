import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CalendarHeatOutput } from '../../src/components/output/CalendarHeatOutput.jsx';

afterEach(cleanup);

describe('CalendarHeatOutput', () => {
  it('renders a rect for every day in the spec range with proportional opacity', () => {
    const { container } = render(<CalendarHeatOutput spec={{
      values: [
        { date: '2026-01-01', value: 1  }, // low
        { date: '2026-01-02', value: 5  },
        { date: '2026-01-03', value: 10 }, // high
      ],
    }} />);

    // Includes some leading-Sunday padding cells (transparent), so just check the day-with-value cells.
    const filled = Array.from(container.querySelectorAll('rect[fill="#569cd6"]'));
    expect(filled).toHaveLength(3);
    const opacities = filled.map((r) => parseFloat(r.getAttribute('fill-opacity')));
    expect(opacities[0]).toBeLessThan(opacities[2]);
  });

  it('renders an empty-state message when no values', () => {
    const { container } = render(<CalendarHeatOutput spec={{ values: [] }} />);
    expect(container.querySelector('.output-calendar-empty')).toBeInTheDocument();
  });
});
