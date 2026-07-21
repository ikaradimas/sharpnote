# Design scope: Live-during-loop variable streaming

Status: **scoped, not started.** Parked for later (2026-07-21).

Motivation: the per-cell variable inspector only refreshes when a cell *completes*
(a `vars_update` snapshot). Users want to watch a value — e.g. a list being built
in a `foreach` — update *during* execution.

## The hard constraint (governs the whole design)

Roslyn scripting keeps a submission's **locals on the stack frame**; they only enter
`ScriptState.Variables` **after** the submission returns. During execution the kernel's
`script` field still points at the **previous** submission's state (it's reassigned only
after the `await` completes — see `ExecuteHandler`).

The existing debugger hits the same wall: its `paused` snapshot is `() => script?.Variables`
(`DebugContext.SendPaused`), so at a breakpoint it can only show prior-cell globals, never
the current cell's mid-execution locals.

**Therefore the kernel cannot reflectively read a cell's local mid-loop.** The value must be
**pushed explicitly** by the running code. This rules out any "open inspector auto-goes-live"
approach for locals.

Transport is already proven: mid-execution emission works today — `.Display()` inside a loop
streams to the renderer as it runs. Only a push API + a live-update view are missing.

## Proposed feature: `Display.Stream(...)`

### Kernel
- New API on `DisplayHelper` + extension, name inferred via `[CallerArgumentExpression]`:
  ```csharp
  Display.Stream(b2cPersistedPurchases);        // name auto-captured "b2cPersistedPurchases"
  Display.Stream(pilList, name: "b2c");         // explicit name
  b2cPersistedPurchases.Stream();               // fluent, returns the value (chainable)
  ```
- Serialize via the **same `AutoDisplay` inference** the inspector uses (`{format, content}` →
  table/tree/text). Emit `{ type: "var_stream", id: cellId, name, format, content, seq }`.
- **Throttle (kernel-side):** coalesce per `name` — emit at most once per ~150 ms (`Stopwatch`),
  always flush the latest at cell completion. Prevents stdout flooding from tight loops.
  (`Stopwatch`/`DateTime` are fine in the kernel; the no-clock restriction is JS-workflow-only.)
- **Payload cap:** stream only the first N rows of a collection (~200) with a "showing N of M"
  note; full value available via normal inspect on completion. Keeps frames small.

### Renderer
- Handle `var_stream` in `useKernelManager` → live store keyed by `(notebookId, name)`,
  coalesced via `requestAnimationFrame` to avoid re-render storms.
- **v1 surface = existing inspector popup.** If a popup's `varName` matches the stream `name`,
  render the streamed `{format, content}` live (reuse `FormatContent`) with a small "● live"
  indicator; on `complete`, settle back to the normal post-run inspect. First `Stream(x)` call
  can **auto-open** a popup so the user need not pre-open it.
- Reuses everything already built (popup, drag/resize, `FormatContent`); streaming just feeds
  frames during execution instead of once at the end.

### Docs / tests / version
- New "Live Variable Streaming" docs section + README line + scripting API reference entry.
  New scripting API → **minor** bump (target 2.28.0).
- Kernel tests: emits `var_stream` with inferred format; throttle coalesces; collection cap;
  final flush on completion. Renderer tests: routes to matching popup; live indicator; settles
  on `complete`.

## Phasing
- **Phase 1 (core, solves the reported case):** `Display.Stream` API + `var_stream` + throttle +
  cap + route-to-popup + auto-open. Medium effort.
- **Phase 2 (optional):** dedicated **Watches panel** listing all active live values; scalar
  watches get a sparkline/history over the run; fluent `.Stream()` polish.

## Open decisions
1. **Naming** — avoid `Watch` (the Vars panel already has post-run "watch expressions").
   Lean `Display.Stream`; alternative `Display.Live`.
2. **v1 surface** — inspector-popup integration (recommended, minimal, direct) vs. build the
   Watches panel first (more discoverable, more work).
3. **Explicit vs. zero-code** — inherently opt-in (user adds a `Stream(...)` call). Fully
   automatic is **not feasible** for locals per the constraint above. Confirmed acceptable.

## Key code touchpoints
- `kernel/Display.cs` (`DisplayHelper`), `kernel/Extensions.cs` (`AutoDisplay`, extension) — API + serialize/emit.
- `kernel/Handlers/ExecuteHandler.cs` — final flush hook on completion.
- `src/hooks/useKernelManager.js` — handle `var_stream`.
- `src/components/dialogs/VarInspectorPopup.jsx` + `src/app/App.jsx` — live rendering + auto-open.
- `src/components/output/FormatContent.jsx` — reused as-is for rendering frames.
