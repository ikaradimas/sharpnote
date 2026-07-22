# Option 3 — Custom script host on public Roslyn compiler APIs

**Status:** scoped, not implemented. This is the structured follow-up to the memory
investigation ([kernel-memory-redesign.md](kernel-memory-redesign.md)). It replaces the
kernel's use of `CSharpScript` (the `Microsoft.CodeAnalysis.CSharp.Scripting` layer) with a
thin execution host built directly on the public compiler API, so we own assembly loading,
compilation retention, and variable state — the three things `CSharpScript` hides and that
block every real fix for the memory growth.

## Why (recap)

The kernel chains cell executions via `script.ContinueWithAsync(code)`. Roslyn's scripting
layer retains the whole chain: every prior `Compilation` (~1 MB/submission, measured) plus
every re-run's variables, and it emits each submission into the **non-collectible** default
`AssemblyLoadContext`. Measured: ~77 % of growth is reclaimable managed state (freed only by
dropping the chain), ~23 % is leaked assemblies (freed only by process restart). `CSharpScript`
exposes **no hook** to control any of this — confirmed against the ecosystem: even .NET
Interactive's answer is "restart the kernel." See the redesign doc for the full measurement.

## Feasibility — PROVEN by spike

A throwaway spike (run against the kernel's exact Roslyn version, then removed) validated the
foundation. All of the following work with **no fork**, using only public APIs:

1. **`CSharpCompilation.CreateScriptCompilation(assemblyName, syntaxTree, references, options,
   previousScriptCompilation, returnType, globalsType)`** gives full *script* semantics:
   globals members resolved unqualified, top-level `var` hoisted to script fields, later
   submissions read earlier submissions' variables, and last-expression return-value capture.
2. **Manual emit → load → invoke** works: `comp.Emit(peStream)` → `alc.LoadFromStream` →
   find the entry point via `comp.GetEntryPoint()` (`ContainingType.MetadataName` = e.g.
   `"Submission#0"`, method `MetadataName` = `"<Factory>"`), `CreateDelegate`/`Invoke` with a
   shared `object?[]` state array (slot 0 = globals instance; each submission stores itself in
   a later slot). Verified: globals `Seed=100` + `var x = Seed + 41; x + 1` → 142, then a
   second submission `x * 2` → 282, then a third → 1141, all sharing one state array.
3. **We own the `AssemblyLoadContext`** (spike used `new AssemblyLoadContext(name, isCollectible)`).

Two retention findings that shape the design:

4. **Chaining REQUIRES `previousScriptCompilation`.** A plain metadata reference to the prior
   submission's emitted assembly does **not** bring script vars into bare-identifier scope
   (spike: "metadata-ref-only resolves bare x: False"). So the compilation chain must be kept
   in some form — this is the structural source of the per-submission retention.
5. **A trimmed previous compilation still resolved a prior var** (spike:
   "chain-from-trimmed-previous resolves x: True" after `previous.RemoveAllSyntaxTrees()`).
   *Promising* for cutting retention by dropping heavy syntax trees/bound-node caches from prior
   compilations — but treat as unverified (could be an artifact of shared immutable state).
   **This is de-risking spike #1 below.**

## What option 3 actually buys (honest value)

- **Solid:** collectible ALC → reclaim the ~23 % loader heap on reset / generation-drop; and
  **ownership of the state array + chain reference makes the generational compaction / reseed
  from the redesign doc *implementable***, which `CSharpScript`'s opaque internals forbid.
- **Potential (pending spike #1):** trimming trees from prior compilations to cut the ~77 %
  per-submission managed retention directly.
- **NOT free:** retention reduction is not automatic — the `previousScriptCompilation` chain
  must be preserved for script scoping (finding #4). The win comes from trimming (#5) and/or
  periodic chain-drop + reseed, not from simply switching hosts.

## Architecture — the SharpNote script host

A single `ScriptHost` class (kernel/ScriptHost/) replacing the `ScriptState<object?> script`
field and the `RunAsync`/`ContinueWithAsync` calls. Components:

- **SubmissionCompiler** — parse (reuse existing `CancellationCheckInjector` /
  `DebugCheckInjector` rewriters and params/formData preambles) → `CreateScriptCompilation`
  with the retained previous compilation → `GetDiagnostics` (compile errors surface exactly as
  today) → `Emit` to a `MemoryStream`.
- **AssemblyLoader** — an `AssemblyLoadContext` we own. v1: non-collectible (parity with today).
  Later: a collectible context per "generation" so a reset (or compaction) can unload it.
- **ExecutionEngine** — owns the `object?[]` submission-state array (slot 0 = globals); invokes
  the `<Factory>` entry point; awaits the returned `Task<object>`; captures the return value.
- **VariableRegistry** — replaces `script.Variables`. Roslyn exposes prior submission variables
  via the previous compilation's symbols + the state array slot instances (read field values by
  reflection). Powers `vars_update`, `VarInspectHandler` (current binding of re-declared vars),
  and the `DebugContext` snapshot.
- **ReferenceManager** — the metadata reference set (framework + `dbMetaRefs` + NuGet). Owns
  "reference generation" so caches (e.g. the watch-expression cache) invalidate on change.

Submission flow: `code → rewrite → CreateScriptCompilation(prev) → Emit → load(alc) →
invoke(<Factory>, stateArray) → { returnValue, newVariables }`.

## Migration strategy (incremental, reversible)

Keep `CSharpScript` as a fallback behind a flag until parity is proven; port one surface at a
time. All handlers that mutate `script` today (Execute, SQL, HTTP, Check, Decision, DB) go
through the same host `Continue(code)` call, so they migrate together once the host lands.

- **Phase 0 — spike #1 (retention):** rigorously determine whether prior compilations can be
  trimmed (trees/bound nodes dropped) while preserving chaining + variable reads. Measure the
  managed heap per submission with trimming vs. without. This decides whether the retention win
  is real or whether we rely solely on compaction. *Gate the whole effort on this.*
- **Phase 1 — host + ExecuteHandler parity:** implement `ScriptHost`, route only `HandleExecute`
  through it behind a flag. Prove parity via the corpus harness (below).
- **Phase 2 — port the other chainers** (SQL/HTTP/Check/Decision/DB) and `VarInspectHandler`
  (variables + expression eval) and `DebugContext`. Remove the `CSharpScript` fallback.
- **Phase 3 — retention:** enable tree-trimming of prior compilations (if spike #1 succeeded).
  Measure against the probes from the redesign investigation.
- **Phase 4 — generational reclamation:** collectible ALC + the carry-bag reseed / compaction
  from the redesign doc (now implementable because we own the state array and chain). Ship the
  memory-pressure trigger + manual "Compact kernel memory" command.

## Parity checklist (must keep working — corpus harness asserts each)

top-level `await` · `var` hoisting + cross-cell reads · unqualified globals members (Display,
Files, Data, Config, Params, Log, Mock, `__ct__`, `__dbg__`) · last-expression return value ·
`using` directive persistence · `#r "nuget:"` / dynamic references · cell-defined `record`/
`class`/`enum` visible in later cells · extension methods · `dynamic` · `unsafe` · anonymous
types + LINQ query syntax · cancellation-check injection · debug-check injection + breakpoints ·
exception messages + stack traces · `DisplayContext.Current` wiring · params/formData preambles
· re-declared-var current-binding semantics · reset.

## Risks & open questions

- **Retention (spike #1)** — the headline uncertainty; may reduce to "compaction only".
- **Entry-point convention** — `"<Factory>"` / `"Submission#N"` names are compiler-internal
  (undocumented). Proven today, but pin the Roslyn version and add a guard test that fails
  loudly if the convention changes on upgrade.
- **State-array slot layout** — proven for the simple chain; verify for many submissions,
  re-declarations, and async entry points returning `Task<object>`.
- **`#r` / NuGet resolution** — `CSharpScript` handles `#r "nuget:"` directives; confirm our
  parse path + ReferenceManager reproduce it (the kernel already does much of this out-of-band).
- **Performance** — we emit per cell (same as today); confirm no regression in first-run
  latency; the watch-expression cache pattern generalizes to self-contained re-runs here.
- **Debug info / EmitOptions** — match PDB/sequence-point behavior the debugger relies on.
- **Effort** — medium-large. Phase 0–1 is the bulk of the risk; 2 is mechanical breadth; 3–4
  deliver the actual memory reclamation and depend on spike #1.

## Testing strategy

- **Corpus parity harness:** a fixed set of cell sequences run through BOTH `CSharpScript` and
  `ScriptHost`, asserting identical variables, outputs, return values, and diagnostics. This is
  the safety net for the whole migration.
- **Convention guard test:** fails if `GetEntryPoint`/`<Factory>` naming changes on Roslyn
  upgrade.
- **Memory regression tests:** generalize the redesign-investigation probes (re-run-with-big-
  object; N-distinct-submissions) into asserted ceilings, run against `ScriptHost`.
