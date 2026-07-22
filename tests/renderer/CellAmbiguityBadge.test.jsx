import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CellAmbiguityBadge } from '../../src/components/editor/CellAmbiguityBadge.jsx';

describe('CellAmbiguityBadge', () => {
  it('renders nothing when tip is empty', () => {
    const { container } = render(<CellAmbiguityBadge tip={null} />);
    expect(container.querySelector('.cell-ambiguous-badge')).toBeNull();
  });

  it('renders the badge with the tip as its title', () => {
    const tip = '"shared" is also set by Cell 2 — "Cell 3" wins (last in order)';
    const { container } = render(<CellAmbiguityBadge tip={tip} />);
    const badge = container.querySelector('.cell-ambiguous-badge');
    expect(badge).not.toBeNull();
    expect(badge).toHaveAttribute('title', tip);
  });
});
