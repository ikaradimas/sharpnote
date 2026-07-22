import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Warning badge shown on a cell that declares a variable ALSO declared by
 * another cell. Because the dependency edge uses "last writer wins", an
 * ambiguous producer can make a surprising cell look like a prerequisite; the
 * badge (with a tooltip naming the variable, the other producers, and which one
 * wins) makes that visible. Renders nothing when `tip` is empty.
 */
export function CellAmbiguityBadge({ tip }) {
  if (!tip) return null;
  return (
    <span className="cell-ambiguous-badge" title={tip} role="img" aria-label="Ambiguous variable producer">
      <AlertTriangle size={11} />
    </span>
  );
}
