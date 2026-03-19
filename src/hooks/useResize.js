import { useState, useRef, useEffect, useCallback } from 'react';

// ── Resize hook ───────────────────────────────────────────────────────────────
// side: 'left'  → handle on left edge,  dragging left  increases width
//       'right' → handle on right edge, dragging right increases width
//       'top'   → handle on top edge,   dragging up    increases height

export function useResize(defaultSize, side, onEnd) {
  const [size, setSize] = useState(defaultSize);
  const sizeRef = useRef(defaultSize);
  const onEndRef = useRef(onEnd);
  useEffect(() => { sizeRef.current = size; }, [size]);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    const startPos = side === 'top' ? e.clientY : e.clientX;
    const startSize = sizeRef.current;
    const min = 150;
    const max = side === 'top' ? 540 : 700;

    const onMove = (ev) => {
      const delta = side === 'left'  ? startPos - ev.clientX
                  : side === 'right' ? ev.clientX - startPos
                  :                    startPos - ev.clientY; // 'top'
      setSize(Math.max(min, Math.min(max, startSize + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      onEndRef.current?.(sizeRef.current);
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = side === 'top' ? 'row-resize' : 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [side]);

  return [size, onMouseDown];
}
