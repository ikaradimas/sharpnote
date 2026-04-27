import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const cytoscapeMock = vi.hoisted(() => vi.fn(() => ({ destroy: vi.fn() })));
vi.mock('cytoscape', () => ({ default: cytoscapeMock }));

import { NetworkOutput } from '../../src/components/output/NetworkOutput.jsx';

afterEach(cleanup);

describe('NetworkOutput', () => {
  beforeEach(() => cytoscapeMock.mockClear());

  it('passes nodes and edges to cytoscape with the requested layout', async () => {
    render(<NetworkOutput spec={{
      nodes: [
        { id: 'A', label: 'Alpha', color: '#569cd6' },
        { id: 'B', label: 'Beta'  },
      ],
      edges: [{ source: 'A', target: 'B', label: 'depends on' }],
      layout: 'circle',
    }} />);

    await waitFor(() => expect(cytoscapeMock).toHaveBeenCalledTimes(1));
    const cfg = cytoscapeMock.mock.calls[0][0];
    expect(cfg.layout.name).toBe('circle');

    const nodeEls = cfg.elements.filter((e) => e.group === 'nodes');
    const edgeEls = cfg.elements.filter((e) => e.group === 'edges');
    expect(nodeEls).toHaveLength(2);
    expect(edgeEls).toHaveLength(1);
    expect(nodeEls[0].data).toMatchObject({ id: 'A', label: 'Alpha', color: '#569cd6' });
    expect(edgeEls[0].data).toMatchObject({ source: 'A', target: 'B', label: 'depends on' });
  });

  it('defaults to the cose layout', async () => {
    render(<NetworkOutput spec={{ nodes: [{ id: '1' }], edges: [] }} />);
    await waitFor(() => expect(cytoscapeMock).toHaveBeenCalledTimes(1));
    expect(cytoscapeMock.mock.calls[0][0].layout.name).toBe('cose');
  });
});
