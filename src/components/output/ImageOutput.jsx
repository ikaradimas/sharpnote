import React, { useRef, useCallback } from 'react';

export function ImageOutput({ spec, notebookId, handleId }) {
  const { src, alt, width, height, interactive } = spec;
  const imgRef = useRef(null);
  const lastMoveRef = useRef(0);

  const sendEvent = useCallback((type, e) => {
    if (!interactive || !handleId || !notebookId) return;
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const scaleX = (img.naturalWidth || width || rect.width) / rect.width;
    const scaleY = (img.naturalHeight || height || rect.height) / rect.height;
    const px = Math.floor((e.clientX - rect.left) * scaleX);
    const py = Math.floor((e.clientY - rect.top) * scaleY);
    window.electronAPI?.sendToKernel(notebookId, { type, handleId, x: px, y: py, button: e.button });
  }, [notebookId, handleId, width, height, interactive]);

  const handleMove = useCallback((e) => {
    const now = Date.now();
    if (now - lastMoveRef.current < 16) return;
    lastMoveRef.current = now;
    sendEvent('canvas_move', e);
  }, [sendEvent]);

  if (!src) return null;

  return (
    <img
      ref={imgRef}
      className="output-image"
      src={src}
      alt={alt || ''}
      style={{
        ...(width ? { maxWidth: `${width}px` } : {}),
        ...(interactive ? { cursor: 'crosshair' } : {}),
      }}
      onClick={interactive ? (e) => sendEvent('canvas_click', e) : undefined}
      onMouseMove={interactive ? handleMove : undefined}
    />
  );
}
