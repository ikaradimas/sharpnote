# Kernel memory accumulation — investigation & redesign options

**Status:** investigation complete; safe mitigations (#2, #3) shipped separately; the
root-cause redesign below is **scoped for later**, not yet implemented.

## Problem

Running a long/looping migration notebook drives the kernel process past **1 GB RSS**
within a few minutes and it keeps climbing. The kernel is a single long-lived process;
all cross-cell state lives in process-lifetime statics (`Program.cs`), and only `reset`
clears any of it.

## Measured decomposition (Release build, workstation GC)

Two independent, additive leaks — both confirmed by driving the real kernel over the
JSON-lines protocol and measuring `GC.GetTotalMemory(forceFullCollection: true)` (live
managed heap) plus OS RSS.

### Leak A — retained user objects (re-run amplification)
Re-running **the same cell** that declares `var big = new byte[20 MB]` adds ~21 MB to the
**live** heap on every run (25 → 547 MB over 25 re-runs). The value survives a forced full
GC. Cause: `CSharpScript.ContinueWithAsync` (`Handlers/ExecuteHandler.cs:207-210`) chains
each submission onto the previous `ScriptState`, which roots **every** prior binding
forever. Re-declaring `big` shadows the name for *display* (`CurrentVariables` dedupes by
name, `ExecuteHandler.cs:377`) but the old object stays rooted through the chain. Freed
only by dropping the chain (`reset` → 549→26 MB).

### Leak B — accumulated compilation graph (every submission, even trivial)
300 distinct trivial submissions (`int aN = N;`, no user data) grew the live heap **292 MB
(~1 MB/submission)** and drove RSS to **1061 MB**. Cause: the chain also roots every prior
`Compilation` (syntax trees, bound symbols, metadata). Present on *every* execution,
re-run or not.

### What `reset` reclaims (decisive measurement)
After 300 submissions: heap 308 MB, RSS 652 MB. After `reset`: heap **31 MB** (−277 MB),
RSS **494 MB** (−158 MB). So of the growth:
- **~77 % is managed** (Compilation graph + retained variables) — **fully reclaimable by
  dropping the `ScriptState` chain.**
- **~23 % is loader heap** (assemblies emitted by Reflection.Emit into the *default*,
  non-collectible `AssemblyLoadContext`) — **not reclaimable even by `reset`**; only a
  process restart or a collectible ALC frees it.

## Why the two "obvious" fixes are wrong or infeasible

- **Collectible `AssemblyLoadContext`** targets only the ~23 % loader slice, *and* is
  infeasible with `CSharpScript`: the scripting API emits into the default context with no
  ALC hook. Getting collectibility means abandoning `CSharpScript` for manual
  `CSharpCompilation` + `LoadFromStream`, which breaks the globals/variable-chaining model
  the whole kernel depends on. Worse: in a stateful notebook, later cells reference earlier
  cells' types/vars, so cross-ALC references **pin** the earlier ALCs and collection never
  happens anyway. Poor return for large risk.
- **Transparent automatic reseed** (drop chain, restore variables) is unsafe *as a naive
  implementation*: cell-defined `record`/`class` types live only in the old emitted
  assemblies, and there is no Roslyn API to inject arbitrary live object *values* into a
  fresh chain. Replaying accumulated source would re-fire side effects (DB writes, HTTP) —
  unacceptable for a migration notebook.

## Recommended redesign — generational compaction via a carry-bag reseed

Targets the reclaimable **77 %** while preserving side-effect safety and (almost all)
typed cross-cell variable flow.

Trigger: automatically when `WorkingSet64` crosses a threshold between cell executions, or
via an explicit "Compact kernel memory" command.

Algorithm:
1. **Snapshot live values.** Copy the *current* binding of each variable
   (`CurrentVariables(script)`) — the live object references — into a static
   `Dictionary<string, object?>` carry bag (e.g. `SharpNoteKernel.CompactionCarry`).
2. **Extract declarations.** From the accumulated executed source, keep only
   *side-effect-free* top-level `record`/`class`/`struct`/`enum`/method declarations →
   `declSource`. (We already retain all executed source in the workspace preamble.)
3. **Drop the chain:** `script = null`. The old chain — every prior `Compilation` and every
   shadowed re-run object — becomes unrooted and is GC'd (the measured 77 %).
4. **Rebuild fresh:** run `declSource` as submission 1 (redeclares types — *no* side
   effects), then submission 2 rebinds each variable to its carried live object:
   `var accounts = (List<NewAccountEntry>)CompactionCarry.Values["accounts"];`
   Types are in scope because step 4a redeclared them; the objects are the *same*
   instances, so no data is copied or re-computed.
5. Clear the carry bag.

Result: managed footprint returns to ≈ current-live-data size; no cells re-run, no side
effects re-fired, variable identities preserved.

**Known limitation:** variables whose *type is unnameable* (anonymous types, some
compiler-generated generics) can't be rebound by a cast. Options: carry them as
`dynamic`/`object`, or drop them from the rebound set (graceful degradation — they simply
don't survive a compaction). The ~23 % loader-heap slice (emitted assemblies) still leaks
slowly and is fully cleared only by a process restart, which should remain the 100 %
escape hatch.

**Complexity:** medium. Needs (a) a declaration-only extractor (Roslyn syntax walk), (b)
the carry-bag static + reseed submissions, (c) a nameable-type predicate, (d) a
memory-pressure trigger + manual command + UI affordance, (e) tests covering
value-type/reference-type/collection/user-record/anonymous-type variables across a
compaction boundary.

## Shipped now (separate, low-risk)

- **#2 — bounded LSP workspace preamble** (`WorkspaceManager`): `AppendExecutedCode` is now
  keyed by cell id so a re-run *replaces* its entry instead of appending a duplicate, and
  the concatenated preamble is capped (oldest cells evicted). Independent of the execution
  chain; removes duplicate growth and shrinks the document the LSP re-binds on every
  keystroke.
- **#3 — bounded renderer accumulators**: per-cell `outputs` capped (oldest coalesced into
  a single "output hidden to conserve memory" marker); `LogPanel.liveEntries` capped to the
  last N.
