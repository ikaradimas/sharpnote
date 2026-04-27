import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProfilePanel } from '../../src/components/panels/ProfilePanel.jsx';

afterEach(cleanup);

const fixtureCells = [
  { id: 'a', type: 'code', name: 'Slow query'    },
  { id: 'b', type: 'code', name: 'Quick filter'  },
  { id: 'c', type: 'markdown', name: 'Notes'    },
  { id: 'd', type: 'code', name: 'Never run'   },
];
const fixtureHistory = {
  a: [{ ts: 1, durationMs:  500, success: true },
      { ts: 2, durationMs:  900, success: true }],
  b: [{ ts: 3, durationMs:   12, success: true },
      { ts: 4, durationMs:   18, success: true }],
};

describe('ProfilePanel', () => {
  it('shows the empty state when no cell has any history', () => {
    const { container } = render(<ProfilePanel cells={fixtureCells} cellRunHistory={{}} />);
    expect(container.querySelector('.profile-panel-empty')).toBeInTheDocument();
  });

  it('renders one row per cell with run history (markdown skipped)', () => {
    const { container } = render(<ProfilePanel cells={fixtureCells} cellRunHistory={fixtureHistory} />);
    const rows = container.querySelectorAll('.profile-row');
    expect(rows.length).toBe(2);
  });

  it('default sort is by last duration descending', () => {
    const { container } = render(<ProfilePanel cells={fixtureCells} cellRunHistory={fixtureHistory} />);
    const rows = container.querySelectorAll('.profile-row');
    expect(within(rows[0]).getByText('Slow query')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Quick filter')).toBeInTheDocument();
  });

  it('clicking a row calls onNavigateToCell with the cell id', () => {
    const onNavigateToCell = vi.fn();
    const { container } = render(
      <ProfilePanel
        cells={fixtureCells}
        cellRunHistory={fixtureHistory}
        onNavigateToCell={onNavigateToCell}
      />,
    );
    fireEvent.click(container.querySelectorAll('.profile-row')[0]);
    expect(onNavigateToCell).toHaveBeenCalledWith('a');
  });
});
