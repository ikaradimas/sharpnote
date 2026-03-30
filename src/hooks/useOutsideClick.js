import { useEffect } from 'react';

// Calls onClose when a mousedown occurs outside all provided refs.
// refs may be a single React ref or an array of refs.
export function useOutsideClick(refs, onClose, enabled) {
  useEffect(() => {
    if (!enabled) return;
    const list = Array.isArray(refs) ? refs : [refs];
    const handler = (e) => {
      if (!list.some((r) => r.current?.contains(e.target))) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [enabled, onClose]); // refs are stable React ref objects — safe to omit from deps
}
