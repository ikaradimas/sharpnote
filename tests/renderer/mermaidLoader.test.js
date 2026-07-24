import { describe, it, expect, vi } from 'vitest';

// mermaid is heavy and must never be loaded eagerly — mock it so the test only
// checks the loader's memoise-and-initialise-once contract.
const { initialize } = vi.hoisted(() => ({ initialize: vi.fn() }));
vi.mock('mermaid', () => ({ default: { initialize, render: vi.fn() } }));

describe('getMermaid', () => {
  it('loads and initialises mermaid exactly once, caching the promise', async () => {
    const { getMermaid } = await import('../../src/utils/mermaid-loader.js');
    const p1 = getMermaid();
    const p2 = getMermaid();
    expect(p1).toBe(p2); // same cached promise, no second import

    const m = await p1;
    expect(m.render).toBeTypeOf('function');
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ startOnLoad: false }));

    await getMermaid(); // a later call must not re-initialise
    expect(initialize).toHaveBeenCalledTimes(1);
  });
});
