import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getNotebookDisplayName } from '../../utils.js';
import { TAB_COLORS } from '../../config/tab-colors.js';
import { TabPinIcon } from './TabPinIcon.jsx';
import { PixelGhostIcon } from './PixelGhostIcon.jsx';
import { TabColorIcon } from './TabColorIcon.jsx';

export function Tab({ notebook, isActive, isDragOver, onActivate, onClose, onRename,
               onDragStart, onDragOver, onDrop, onDragEnd, onSetColor,
               isPinned = false, onTogglePin }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [pickerPos, setPickerPos] = useState(null); // {top, left} when open
  const inputRef = useRef(null);
  const pickerRef = useRef(null);
  const colorBtnRef = useRef(null);

  const name = getNotebookDisplayName(notebook.path, notebook.title);
  const ghostSeed = isPinned && notebook.path
    ? [...notebook.path].reduce((a, c) => a + c.charCodeAt(0), 0)
    : 0;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerPos) return;
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerPos(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerPos]);

  const startEdit = (e) => {
    e.stopPropagation();
    setDraft(name);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename?.(trimmed);
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  const color = notebook.color;
  const tabStyle = color ? { borderTopColor: color, borderTopWidth: '2px' } : undefined;

  return (
    <div
      className={`tab${isActive ? ' tab-active' : ''}${isDragOver ? ' tab-drag-over' : ''}`}
      style={tabStyle}
      draggable={!editing}
      onDragStart={() => onDragStart(notebook.id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(notebook.id); }}
      onDrop={(e) => { e.preventDefault(); onDrop(notebook.id); }}
      onDragEnd={onDragEnd}
      onClick={editing ? undefined : onActivate}
      title={notebook.path || name}
    >
      {isPinned && notebook.path && (
        <span className="tab-ghost-icon" style={color ? { color } : undefined}>
          <PixelGhostIcon seed={ghostSeed} />
        </span>
      )}
      {editing ? (
        <input
          ref={inputRef}
          className="tab-rename-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
            e.stopPropagation();
          }}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          {notebook.kernelStatus && (
            <span className={`tab-kernel-dot tab-kernel-${notebook.kernelStatus}`} />
          )}
          <span className="tab-title" onDoubleClick={startEdit}>{name}</span>
        </>
      )}
      {notebook.isDirty && <span className="tab-dirty" title="Unsaved changes">•</span>}
      {onSetColor && (
        <button
          ref={colorBtnRef}
          className={`tab-color-btn${color ? ' has-color' : ''}`}
          style={color ? { color } : undefined}
          onClick={(e) => {
            e.stopPropagation();
            if (pickerPos) { setPickerPos(null); return; }
            const rect = colorBtnRef.current.getBoundingClientRect();
            setPickerPos({ top: rect.bottom + 4, left: rect.left });
          }}
          title="Set tab color"
        ><TabColorIcon /></button>
      )}
      {notebook.path && (
        <button
          className={`tab-pin-btn${isPinned ? ' pinned' : ''}`}
          style={isPinned && color ? { color } : undefined}
          onClick={(e) => { e.stopPropagation(); onTogglePin?.(); }}
          title={isPinned ? 'Unpin tab' : 'Pin tab'}
        ><TabPinIcon /></button>
      )}
      {!isPinned && (
        <button
          className="tab-close"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          title="Close tab"
        >×</button>
      )}
      {pickerPos && createPortal(
        <div
          ref={pickerRef}
          className="tab-color-picker"
          style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {TAB_COLORS.map((c, i) => (
            <button
              key={i}
              className={`tab-color-swatch${c === color ? ' selected' : ''}${c === null ? ' swatch-clear' : ''}`}
              style={c ? { background: c } : undefined}
              title={c ?? 'Clear color'}
              onClick={() => { onSetColor(c); setPickerPos(null); }}
            />
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
