import { useCallback } from 'react';

function shortId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * CRUD operations for notebook pipelines (named cell execution groups).
 */
export function usePipelineManager({ setNbDirty }) {
  const createPipeline = useCallback((notebookId, name, cellIds) => {
    const id = shortId();
    setNbDirty(notebookId, (n) => ({
      pipelines: [...(n.pipelines || []), { id, name, cellIds, color: null }],
    }));
    return id;
  }, [setNbDirty]);

  const renamePipeline = useCallback((notebookId, pipelineId, name) => {
    setNbDirty(notebookId, (n) => ({
      pipelines: (n.pipelines || []).map((p) =>
        p.id === pipelineId ? { ...p, name } : p
      ),
    }));
  }, [setNbDirty]);

  const deletePipeline = useCallback((notebookId, pipelineId) => {
    setNbDirty(notebookId, (n) => ({
      pipelines: (n.pipelines || []).filter((p) => p.id !== pipelineId),
    }));
  }, [setNbDirty]);

  const setPipelineCells = useCallback((notebookId, pipelineId, cellIds) => {
    setNbDirty(notebookId, (n) => ({
      pipelines: (n.pipelines || []).map((p) =>
        p.id === pipelineId ? { ...p, cellIds } : p
      ),
    }));
  }, [setNbDirty]);

  const setPipelineColor = useCallback((notebookId, pipelineId, color) => {
    setNbDirty(notebookId, (n) => ({
      pipelines: (n.pipelines || []).map((p) =>
        p.id === pipelineId ? { ...p, color } : p
      ),
    }));
  }, [setNbDirty]);

  return {
    createPipeline,
    renamePipeline,
    deletePipeline,
    setPipelineCells,
    setPipelineColor,
  };
}
