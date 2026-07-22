import React from 'react';
import { Hand } from 'lucide-react';

/**
 * Header toggle marking a runnable cell "manual only": excluded from every
 * automatic run (never pulled in as another cell's dependency, skipped by Run
 * All / Run from / Run to, not traversed through), so it runs only from its own
 * ▶. Built for side-effecting cells (SQL writes, HTTP POSTs, shell commands).
 * The highlighted (-on) state is itself the indicator — no separate badge.
 */
export function CellManualToggle({ manualOnly, onToggle }) {
  return (
    <button
      type="button"
      className={`cell-manual-btn${manualOnly ? ' cell-manual-btn-on' : ''}`}
      onClick={onToggle}
      aria-pressed={!!manualOnly}
      title={manualOnly
        ? 'Manual only — this cell is excluded from automatic runs and Run All; it runs only from its own ▶. Click to allow automatic runs.'
        : 'Runs automatically. Click to mark manual-only (never auto-run as a dependency or in a bulk run — for cells with side effects).'}
    >
      <Hand size={13} />
    </button>
  );
}
