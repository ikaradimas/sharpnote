// ── Tab ID constants ──────────────────────────────────────────────────────────

export const DOCS_TAB_ID  = '__docs__';
export const KAFKA_TAB_ID = '__kafka__';
export const LIB_EDITOR_ID_PREFIX = '__libed__';

// ── Kernel request timeouts ───────────────────────────────────────────────────

export const COMPLETION_TIMEOUT = 2000; // autocomplete — fast turnaround expected
export const LINT_TIMEOUT       = 5000; // lint — Roslyn compilation can be slower
export const SIGNATURE_TIMEOUT  = 2000; // signature help — fast turnaround expected
