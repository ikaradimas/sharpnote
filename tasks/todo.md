# Performance: Top 5 quick wins (2.34.0)

## 1. Minify production bundle
- [x] `package.json`: extract `build:assets`; add `build:renderer:prod` (--minify); point `dist:*` at it
- [x] Verify: prod build 18.8 MB → 9.3 MB (~50%)

## 2. Lazy-load mermaid (keep it out of startup execution)
- [x] `src/utils/mermaid-loader.js` (new): shared `getMermaid()` that dynamic-imports + initialises once
- [x] `MarkdownCell.jsx`: drop static import + module-load initialize; use `getMermaid()`
- [x] `MarkdownOutput.jsx`: use shared loader (also fixes missing initialize)
- [x] `api-editor/ModelDiagram.jsx`: drop static import; use `getMermaid()`

## 3. Roslyn warm-up after "ready"
- [x] `kernel/Program.cs`: fire-and-forget `CSharpScript.RunAsync("1", options)` after ready emit — builds clean

## 4. Lazy run-plan tooltip (kill O(N²) per render)
- [x] `NotebookView.jsx`: pass `getRunTitle={() => runPlanTip(cell.id)}` instead of eager string
- [x] `CodeCell.jsx`: thread `getRunTitle`
- [x] `CellRunGroup.jsx`: compute title on run-button `onMouseEnter` (imperative), default otherwise
- [x] (ambiguityTip stays eager — it's cheap map lookups, not the hot path)

## 5. Cap large table outputs at the kernel boundary + cache reflection
- [x] `kernel/Display.cs`: `_propCache` per-type PropertyInfo cache in `ToRowDicts`
- [x] `kernel/Display.cs`: `MaxDisplayRows` (50k) cap in `Table`/`TableFromDicts`; emit `totalRows`/`truncated` only when capped
- [x] `src/components/output/OutputBlock.jsx`: thread `truncated`/`totalRows` to DataTable
- [x] `src/components/output/DataTable.jsx` + CSS: "first N of M — capped by the kernel" notice (never silent)
- [x] Confirmed cap covers SQL (`DisplayTable`→`TableFromDicts`) + AutoDisplay + `.Display()`

## Docs
- [x] docs-sections "Large Tables" note, README Rich-output clause, changelog 2.34

## Tests
- [x] `tests/renderer/mermaidLoader.test.js` (memoize + initialize once) — 1
- [x] `tests/renderer/CellRunGroup.test.jsx` (lazy title on hover) — 3
- [x] `tests/renderer/DataTable.test.jsx` (truncation notice) — +2 (25 total)
- [x] `kernel/kernel.Tests` DisplayTests: row cap + truncated + under-cap unchanged — +2 (318 total)
- [x] Full JS (1447) + kernel (318) green; prod bundle 18.8→9.3 MB

## Verify + commit
- [x] Bump `package.json` 2.33.0 → 2.34.0
- [ ] Commit (Claude authorship + trailer)

## Review

**Done (2.34.0).** All five landed, both suites green (JS 1447 / kernel 318), renderer compiles.

1. **Minify** — factored `build:assets`, added `build:renderer:prod` (--minify) used by `dist:*`;
   dev/tests keep the readable unminified build. **18.8 MB → 9.3 MB.**
2. **Lazy mermaid** — shared `src/utils/mermaid-loader.js` (`getMermaid()`, initialised once);
   removed the static import + module-load `initialize()` from MarkdownCell/MarkdownOutput/
   ModelDiagram. Defers the heaviest dep's execution off startup (also fixed MarkdownOutput
   silently missing the theme/security init).
3. **Roslyn warm-up** — fire-and-forget `CSharpScript.RunAsync("1", options)` after `ready`;
   own throwaway ScriptState, never touches the `script` chain.
4. **Lazy run-plan tooltip** — `getRunTitle` computed on the run button's `onMouseEnter`
   (imperative title set), not per cell per render. Kills the O(N²) `computeRunPlan` from the
   typing path. `ambiguityTip` left eager (cheap map lookups).
5. **Output cap + reflection cache** — `MaxDisplayRows = 50_000` cap in `Table`/`TableFromDicts`
   (covers `.Display()`, AutoDisplay, `.DisplayTable`/SQL); `totalRows`/`truncated` attached
   ONLY when capped (normal payloads byte-identical → no snapshot churn); per-type
   `PropertyInfo` cache in `ToRowDicts`. Renderer shows a non-silent "first N of M" notice.

Not runnable here: live Electron GUI (no binary). Verified via full JS + kernel suites, prod/dev
bundle builds, and renderer compile. Manual GUI check worth doing: confirm perceived startup +
first-run feel and that a >50k-row `.Display()` shows the notice.

Follow-ups I noted but did NOT do (out of Top-5 scope): esbuild `--splitting` (to actually shrink
the initial chunk, needs `<script type="module">`), lazy-load katex + `React.lazy` output
renderers, LSP diagnostics debounce, main-thread raw-string forwarding of large kernel messages.
