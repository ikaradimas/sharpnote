import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SankeyOutput } from '../../src/components/output/SankeyOutput.jsx';

afterEach(cleanup);

describe('SankeyOutput', () => {
  it('renders one rect per node and one path per link', () => {
    const { container } = render(<SankeyOutput spec={{
      nodes: [
        { name: 'Source' },
        { name: 'Middle' },
        { name: 'Sink' },
      ],
      links: [
        { source: 0, target: 1, value: 10 },
        { source: 1, target: 2, value: 10 },
      ],
      width: 400, height: 200,
    }} />);

    expect(container.querySelectorAll('rect')).toHaveLength(3);
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(container.querySelectorAll('text')).toHaveLength(3);
    const labels = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(labels).toEqual(['Source', 'Middle', 'Sink']);
  });

  it('renders an empty-state message when spec has no nodes/links', () => {
    const { container } = render(<SankeyOutput spec={{ nodes: [], links: [] }} />);
    expect(container.querySelector('.output-sankey-empty')).toBeInTheDocument();
  });
});
