import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePipelineManager } from '../../src/hooks/usePipelineManager.js';

function setup() {
  const setNbDirty = vi.fn();
  const { result } = renderHook(() => usePipelineManager({ setNbDirty }));
  return { result, setNbDirty };
}

/** Call the updater that setNbDirty received and return its result. */
function applyUpdater(setNbDirty, notebook, callIndex = 0) {
  const updater = setNbDirty.mock.calls[callIndex][1];
  return updater(notebook);
}

describe('usePipelineManager', () => {
  it('createPipeline adds a pipeline with name and cellIds', () => {
    const { result, setNbDirty } = setup();

    let id;
    act(() => { id = result.current.createPipeline('nb1', 'My Pipeline', ['c1', 'c2']); });

    expect(setNbDirty).toHaveBeenCalledOnce();
    expect(setNbDirty).toHaveBeenCalledWith('nb1', expect.any(Function));
    expect(typeof id).toBe('string');

    const patch = applyUpdater(setNbDirty, { pipelines: [] });
    expect(patch.pipelines).toHaveLength(1);
    expect(patch.pipelines[0]).toMatchObject({ name: 'My Pipeline', cellIds: ['c1', 'c2'], color: null });
  });

  it('createPipeline appends to existing pipelines', () => {
    const { result, setNbDirty } = setup();

    act(() => { result.current.createPipeline('nb1', 'Second', ['c3']); });

    const existing = { pipelines: [{ id: 'p0', name: 'First', cellIds: ['c1'], color: null }] };
    const patch = applyUpdater(setNbDirty, existing);
    expect(patch.pipelines).toHaveLength(2);
    expect(patch.pipelines[0].name).toBe('First');
    expect(patch.pipelines[1].name).toBe('Second');
  });

  it('renamePipeline updates the name', () => {
    const { result, setNbDirty } = setup();

    act(() => { result.current.renamePipeline('nb1', 'p1', 'Renamed'); });

    expect(setNbDirty).toHaveBeenCalledWith('nb1', expect.any(Function));

    const existing = { pipelines: [{ id: 'p1', name: 'Old', cellIds: [], color: null }] };
    const patch = applyUpdater(setNbDirty, existing);
    expect(patch.pipelines[0].name).toBe('Renamed');
  });

  it('deletePipeline removes the pipeline', () => {
    const { result, setNbDirty } = setup();

    act(() => { result.current.deletePipeline('nb1', 'p1'); });

    const existing = {
      pipelines: [
        { id: 'p1', name: 'Doomed', cellIds: [], color: null },
        { id: 'p2', name: 'Safe', cellIds: [], color: null },
      ],
    };
    const patch = applyUpdater(setNbDirty, existing);
    expect(patch.pipelines).toHaveLength(1);
    expect(patch.pipelines[0].id).toBe('p2');
  });

  it('setPipelineCells updates the cellIds', () => {
    const { result, setNbDirty } = setup();

    act(() => { result.current.setPipelineCells('nb1', 'p1', ['c5', 'c6']); });

    const existing = { pipelines: [{ id: 'p1', name: 'Test', cellIds: ['c1'], color: null }] };
    const patch = applyUpdater(setNbDirty, existing);
    expect(patch.pipelines[0].cellIds).toEqual(['c5', 'c6']);
  });

  it('setPipelineColor updates the color', () => {
    const { result, setNbDirty } = setup();

    act(() => { result.current.setPipelineColor('nb1', 'p1', 'blue'); });

    const existing = { pipelines: [{ id: 'p1', name: 'Test', cellIds: [], color: null }] };
    const patch = applyUpdater(setNbDirty, existing);
    expect(patch.pipelines[0].color).toBe('blue');
  });

  it('operations on missing pipelines array default to empty', () => {
    const { result, setNbDirty } = setup();

    act(() => { result.current.renamePipeline('nb1', 'p1', 'Name'); });

    // pipelines is undefined — should default to empty array, find nothing, return empty
    const patch = applyUpdater(setNbDirty, {});
    expect(patch.pipelines).toEqual([]);
  });
});
