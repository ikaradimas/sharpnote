# LSP Integration Plan — SharpNote

**Branch:** `feature/lsp-integration`
**Goal:** Replace the custom reflection-based autocomplete and parse-only lint with official Roslyn Workspace APIs, exposed via an in-kernel LSP JSON-RPC server and consumed by a CodeMirror LSP client in the renderer.

---

## Architecture Decision

The kernel stays a single long-running process per notebook. It will gain a **second communication channel** alongside the existing JSON stdin/stdout protocol:

- **Channel 1 (existing):** newline-delimited JSON over stdin/stdout — execution, NuGet, DB, etc.
- **Channel 2 (new):** LSP JSON-RPC 2.0 over a **named pipe** — completions, diagnostics, signature help.

The kernel reports the named pipe path in its `ready` message so the renderer knows where to connect. The Electron main process proxies the named pipe to the renderer via a dedicated IPC channel.

Why named pipe over TCP: no port conflicts, no firewall prompts, automatically cleaned up on process exit.

---

## Step protocol (repeat before every step)

1. Update memory checkpoint with current step status
2. Run `/compact` to flush context
3. Resume from memory — read `tasks/lsp-integration.md` and `memory/project_lsp_integration.md`
4. Execute the step
5. Commit completed work

---

## Step 1 — Roslyn Workspace spike (kernel-side validation)

**Goal:** Prove that `CompletionService` and semantic diagnostics work in script-mode with injected globals before writing any production code.

**Tasks:**
- [ ] Add `Microsoft.CodeAnalysis.CSharp.Workspaces` to `kernel/kernel.csproj`
- [ ] Write `kernel/WorkspaceManager.cs` (throwaway spike class):
  - Create an `AdhocWorkspace` + `Project` with `LanguageNames.CSharp`
  - Set `ParseOptions = CSharpParseOptions(SourceCodeKind.Script)`
  - Add the same `MetadataReferences` the script uses (mscorlib, System.Linq, etc.)
  - Add a fake `globals.cs` document that declares `ScriptGlobals` so the document "sees" Display, Db, etc.
  - Add a `script.cs` document with `SourceCodeKind.Script`
  - Call `CompletionService.GetService(document).GetCompletionsAsync(document, position)`
  - Log results to a test output
- [ ] Verify completions return member items for `Display.`, `Db.`, `Console.`, and LINQ chains
- [ ] Verify `Compilation.GetDiagnosticsAsync()` returns semantic errors (e.g. undefined variable)
- [ ] Commit spike

**Memory checkpoint:** save step 1 status before starting.

---

## Step 2 — WorkspaceManager production class

**Goal:** A reusable, production-quality class that keeps the AdhocWorkspace in sync with the kernel's script state.

**Tasks:**
- [ ] Create `kernel/WorkspaceManager.cs`:
  - `UpdateDocument(string code)` — replaces the script document text
  - `UpdateReferences(IEnumerable<MetadataReference> refs)` — called after NuGet loads
  - `GetCompletionsAsync(int position)` → `IEnumerable<CompletionItemData>`
  - `GetDiagnosticsAsync()` → `IEnumerable<DiagnosticData>`
  - `GetSignatureHelpAsync(int position)` → `SignatureHelpData`
- [ ] Globals document is generated from `ScriptGlobals` fields via reflection at startup, so it stays in sync with actual globals
- [ ] WorkspaceManager is instantiated once per kernel process and shared across handlers
- [ ] Remove spike code

**Memory checkpoint:** save step 2 status before starting.

---

## Step 3 — Replace AutocompleteHandler

**Goal:** Swap reflection-based completions for `CompletionService`.

**Tasks:**
- [ ] Rewrite `kernel/Handlers/AutocompleteHandler.cs`:
  - Call `WorkspaceManager.GetCompletionsAsync(position)`
  - Map `CompletionItem` fields → existing `{label, type, detail}` JSON shape (no protocol change)
  - Remove all regex context detection and reflection logic
  - Remove `WellKnownTypes` / `WellKnownInstances` dictionaries (workspace handles them)
- [ ] Run xUnit tests: `npm run test:kernel`
- [ ] Manual smoke-test: `Display.`, `Console.`, `db.Users.`, LINQ chain
- [ ] Commit

**Memory checkpoint:** save step 3 status before starting.

---

## Step 4 — Replace LintHandler with semantic diagnostics

**Goal:** Upgrade from parse-only to full semantic diagnostics.

**Tasks:**
- [ ] Rewrite `kernel/Handlers/LintHandler.cs`:
  - Call `WorkspaceManager.GetDiagnosticsAsync()`
  - Filter hidden/info severity (keep warning + error)
  - Map to existing `{from, to, severity, message}` JSON shape
  - Remove `CSharpSyntaxTree.ParseText` approach
- [ ] Run xUnit tests
- [ ] Verify semantic errors (e.g. `int x = "hello"`) now surface as diagnostics
- [ ] Commit

**Memory checkpoint:** save step 4 status before starting.

---

## Step 5 — LSP JSON-RPC server in kernel

**Goal:** Expose the workspace over a proper LSP named pipe so CodeMirror can use a standard LSP client.

**Tasks:**
- [ ] Add `StreamJsonRpc` NuGet package to `kernel/kernel.csproj`
- [ ] Create `kernel/LspServer.cs`:
  - Creates a named pipe server (`\\.\pipe\sharpnote-lsp-{pid}` on Windows, `/tmp/sharpnote-lsp-{pid}` on Unix)
  - Implements LSP handlers using StreamJsonRpc:
    - `initialize` / `initialized`
    - `textDocument/didOpen`, `textDocument/didChange` → calls `WorkspaceManager.UpdateDocument()`
    - `textDocument/completion` → calls `WorkspaceManager.GetCompletionsAsync()`
    - `textDocument/signatureHelp` → calls `WorkspaceManager.GetSignatureHelpAsync()`
    - `textDocument/publishDiagnostics` → push notification, fired after every `didChange`
  - Runs on a background thread; does not touch stdin/stdout
- [ ] Modify `kernel/Program.cs`:
  - Start `LspServer` during init
  - Include `lspPipe` field in the `ready` message: `{ type: "ready", lspPipe: "/tmp/sharpnote-lsp-12345" }`
- [ ] Commit

**Memory checkpoint:** save step 5 status before starting.

---

## Step 6 — Electron main: proxy LSP pipe to renderer

**Goal:** The renderer (sandboxed) cannot open named pipes directly; the main process proxies it.

**Tasks:**
- [ ] Modify `src/main/kernel-manager.js`:
  - Parse `lspPipe` from the `ready` message
  - Open the named pipe as a Node.js `net.Socket`
  - Expose two IPC channels per notebook:
    - `lsp-send-{notebookId}` (renderer → main → pipe)
    - `lsp-receive-{notebookId}` (pipe → main → renderer)
  - Clean up socket on kernel kill
- [ ] Modify `src/main/main.js`: register the two IPC handlers
- [ ] Expose `window.electronAPI.lspSend(notebookId, data)` and `onLspReceive(notebookId, cb)` in preload

**Memory checkpoint:** save step 6 status before starting.

---

## Step 7 — CodeMirror LSP client in renderer

**Goal:** Replace the custom completion/lint CodeMirror extensions with a standard LSP client.

**Tasks:**
- [ ] `npm install codemirror-languageserver`
- [ ] Create `src/components/editor/lspTransport.js`:
  - Implements the `Transport` interface expected by `codemirror-languageserver`
  - Sends/receives via `window.electronAPI.lspSend` / `onLspReceive`
- [ ] Modify `src/components/editor/CodeEditor.jsx`:
  - Remove `lintSource`, `lintCompartment`, and the manual `linter()` extension
  - Remove `keywordSource`, `dynamicSource`, and the manual `autocompletion()` extension
  - Remove `signatureField` StateField and tooltip logic
  - Add `languageServerWithTransport({ transport, documentUri, ... })` extension
  - Keep `acceptCompletion` Tab/Enter keybinding (LSP client uses CodeMirror's built-in completion UI)
- [ ] Update `CodeCell.jsx` / `NotebookView.jsx` to pass `notebookId` down for transport creation
- [ ] Remove `onRequestCompletions`, `onRequestLint`, `onRequestSignature` props (no longer needed)
- [ ] Remove corresponding `requestLint` / `requestAutocomplete` / `requestSignature` calls from `useKernelManager.js`
- [ ] Run Vitest tests: `npm test`
- [ ] Commit

**Memory checkpoint:** save step 7 status before starting.

---

## Step 8 — Cleanup and docs

**Tasks:**
- [ ] Remove `CSHARP_KEYWORDS` config constant if no longer used elsewhere
- [ ] Update `src/config/docs-sections.js`: update Code Diagnostics description to reflect semantic errors
- [ ] Update `README.md`: note that C# editor uses Roslyn LSP for completions and diagnostics
- [ ] Run full test suite: `npm test && npm run test:kernel`
- [ ] Bump version (minor — new feature)
- [ ] Commit

---

## Resumption Guide

If this session is interrupted, the next session should:
1. Check `tasks/lsp-integration.md` for the current step (look for unchecked boxes)
2. Read the corresponding memory checkpoint entry for context on what was done and what's next
3. Run `git log --oneline feature/lsp-integration` to see what's been committed
4. Pick up from the first unchecked task in the current step

---

## Key Facts

| Item | Value |
|---|---|
| Branch | `feature/lsp-integration` |
| .NET version | 10.0 |
| Roslyn package already present | `Microsoft.CodeAnalysis.CSharp.Scripting 4.9.2` |
| New NuGet needed (Step 1-4) | `Microsoft.CodeAnalysis.CSharp.Workspaces` |
| New NuGet needed (Step 5) | `StreamJsonRpc` |
| New npm needed (Step 7) | `codemirror-languageserver` |
| Kernel IPC | newline-delimited JSON over stdin/stdout |
| LSP transport | named pipe (path reported in `ready` message) |
| Script mode | `SourceCodeKind.Script` — must be set on workspace document |
| Script globals | `Display`, `Panels`, `Db`, `Config`, `Util`, `__ct__` — declared in a synthetic globals document |
