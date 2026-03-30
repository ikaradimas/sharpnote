import { useState, useCallback } from 'react';

export function useClipboard(timeout = 1500) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), timeout);
    }).catch(() => {});
  }, [timeout]);
  return [copied, copy];
}
