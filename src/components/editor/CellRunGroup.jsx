import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, ChevronsRight, ChevronsUp } from 'lucide-react';
import { useOutsideClick } from '../../hooks/useOutsideClick.js';

export function CellRunGroup({ onRun, onInterrupt, onRunFrom, onRunTo, isRunning, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false), open);

  useEffect(() => { if (isRunning) setOpen(false); }, [isRunning]);

  return (
    <div className="cell-run-group" ref={ref}>
      {isRunning ? (
        onInterrupt ? (
          <button className="cell-stop-btn" onClick={onInterrupt}
                  title="Interrupt (stops async ops; use Reset for tight loops)">
            <Square size={12} /> Stop
          </button>
        ) : (
          <button className="cell-stop-btn" disabled title="Running…">
            <Square size={12} /> Running
          </button>
        )
      ) : (
        <>
          <button className="run-btn" onClick={onRun} disabled={disabled} title="Run (Ctrl+Enter)">
            <Play size={12} /> Run
          </button>
          {(onRunFrom || onRunTo) && (
            <button className="cell-run-chevron" onClick={() => setOpen((v) => !v)}
                    disabled={disabled} title="More run options">▾</button>
          )}
        </>
      )}
      {open && !isRunning && (
        <div className="cell-run-dropdown">
          <button className="cell-run-dropdown-item" onClick={() => { onRun(); setOpen(false); }}>
            <Play size={12} /> Run this cell
          </button>
          {onRunFrom && (
            <button className="cell-run-dropdown-item" onClick={() => { onRunFrom(); setOpen(false); }}>
              <ChevronsRight size={12} /> Run from here
            </button>
          )}
          {onRunTo && (
            <button className="cell-run-dropdown-item" onClick={() => { onRunTo(); setOpen(false); }}>
              <ChevronsUp size={12} /> Run to here
            </button>
          )}
        </div>
      )}
    </div>
  );
}
