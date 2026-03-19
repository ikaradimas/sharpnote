import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { isNotebookId } from '../../utils.js';
import { TabOverflowMenu } from './TabOverflowMenu.jsx';

export function TabSection({ items, className, activeId, renderItem, onMoveToFront, maxFraction }) {
  const sectionRef = useRef(null);
  const widthCache = useRef(new Map());
  const [overflowFrom, setOverflowFrom] = useState(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => forceUpdate(n => n + 1));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    el.querySelectorAll(':scope > [data-tabid]').forEach(slot => {
      const child = slot.firstElementChild;
      if (child && child.offsetWidth > 0)
        widthCache.current.set(slot.dataset.tabid, child.offsetWidth);
    });

    const OVERFLOW_W = 36;
    const GAP = 2;
    const sectionW = maxFraction != null
      ? (el.parentElement?.offsetWidth ?? el.offsetWidth) * maxFraction
      : el.offsetWidth;
    let sum = 0, cut = null;

    for (let i = 0; i < items.length; i++) {
      if (i > 0) sum += GAP; // gap before this item (not before the first)
      sum += (widthCache.current.get(items[i].id) ?? 100);
      const hasMore = i < items.length - 1;
      if (sum + (hasMore ? GAP + OVERFLOW_W : 0) > sectionW) {
        cut = Math.max(i, 1); // always show at least one tab
        break;
      }
    }

    setOverflowFrom(prev => prev === cut ? prev : cut);
  });

  const overflowItems = overflowFrom !== null ? items.slice(overflowFrom) : [];

  return (
    <div ref={sectionRef} className={`tab-section${className ? ` ${className}` : ''}`}>
      {items.map((item, i) => (
        <div
          key={item.id}
          data-tabid={item.id}
          style={overflowFrom !== null && i >= overflowFrom
            ? { display: 'none' }
            : { display: 'contents' }}
        >
          {renderItem(item)}
        </div>
      ))}
      {overflowItems.length > 0 && (
        <TabOverflowMenu
          items={overflowItems}
          activeId={activeId}
          onSelect={(item) => {
            item._onActivate();
            if (onMoveToFront && isNotebookId(item.id)) {
              const firstNb = items.find(it => isNotebookId(it.id));
              if (firstNb && firstNb.id !== item.id) onMoveToFront(item.id, firstNb.id);
            }
          }}
        />
      )}
    </div>
  );
}
