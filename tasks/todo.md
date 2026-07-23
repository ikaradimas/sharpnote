# Embedded Files: preview + import/export UI (2.33.0)

Plan: `~/.claude/plans/declarative-mixing-rainbow.md`

## A. Preview (head ~100 lines) — renderer-only
- [x] `src/utils.js`: `decodeEmbeddedContent(file, maxBytes)` + `embedPreviewLines(file, maxLines, maxBytes)`
- [x] `EmbedPanel.jsx`: Preview section in expanded row (binary note / empty / `<pre>` + truncated note)
- [x] `src/styles.css`: `.embed-file-preview`, `.embed-file-preview-note`

## B. Export (per-file, binary-safe)
- [x] `src/main/file-ops.js`: `export-embedded-file` handler (Buffer base64/utf-8, save dialog)
- [x] `preload.js`: `exportEmbeddedFile`
- [x] `src/app/App.jsx`: `onExport` in embed panel props
- [x] `EmbedPanel.jsx`: Download button in row actions; `.embed-file-export` CSS

## C. Import — harden existing single-file
- [x] `src/utils.js`: `uniqueEmbedName(base, existingNames)`
- [x] `src/app/App.jsx` `onAdd`: use `uniqueEmbedName`
- [x] `EmbedPanel.jsx`: relabel `+` title → "Import file…"

## D. Docs
- [x] `src/config/docs-sections.js`: extend `embedded-files` section
- [x] `README.md`: Features list (+ new Embedded Files panel bullet)
- [x] `src/config/changelog.js`: 2.33 entry (consistency with prior features)

## E. Tests
- [x] `tests/renderer/embedPreview.test.js` (new): helpers — 16 pass
- [x] `tests/renderer/EmbedPanel.test.jsx` (new): preview/binary/export/import UI — 5 pass
- [x] `tests/main/fileOps.test.js` (extend): export-embedded-file round-trip + cancel — 16 pass

## F. Verify + commit
- [x] `npm test` green (kernel untouched) — 95 files / 1441 tests
- [x] Renderer bundle compiles (esbuild, exit 0) — GUI not runnable here
- [x] Bump `package.json` 2.32.1 → 2.33.0
- [ ] Commit (Claude authorship + trailer)

## Review

**Done (2.33.0).**

- **Preview** is renderer-only: two browser-safe helpers in `utils.js`
  (`decodeEmbeddedContent` caps the decode at 128 KB; `embedPreviewLines` slices to 100
  lines and flags binary via NUL-sniff / undecodable-base64). EmbedPanel shows it lazily in
  the expanded row (`<pre>`, capped-height scroll), with binary / empty / truncated notes.
- **Export** is a per-file download button → new `export-embedded-file` IPC. Binary-safe:
  base64 entries decode to bytes (`Buffer.from(content,'base64')`), text writes UTF-8. The
  handler takes an injected `dialog` (consistent with the module's `app`/`shell` DI; `require`
  fallback for prod), which also made it unit-testable via `fo._dialog`.
- **Import** kept single-file; hardened with `uniqueEmbedName` so a colliding sanitised name
  gets `_2/_3…` instead of clobbering `Files["name"]`. `+` relabelled "Import file…".
- Tests: 16 helper + 5 panel + 4 export-handler (round-trip text & binary, cancel,
  defaultPath). Full JS suite 1441 pass. Docs: docs-sections, README (new panel bullet),
  changelog 2.33.
- Not runnable here: live Electron GUI (no binary in env) — verified via component render
  tests + full renderer bundle compile. Manual byte-for-byte binary-export check is the one
  thing left for a human at a GUI.
