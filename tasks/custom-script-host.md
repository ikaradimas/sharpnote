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
5. **Tree-trimming does NOT work — spike #1 RESOLVED, negative.** A rigorous follow-up spike
   (trimming the compilation that *declares* the symbols, not a downstream one) showed
   `RemoveAllSyntaxTrees()` destroys the declaration symbols: chaining a submission from a
   trimmed-declaring previous fails to compile — `x`, a cell-defined `record Foo`, and a
   method `Bar` all report "does not exist". (The earlier "resolves x: True" was an artifact:
   the trimmed compilation still chained to an *intact* earlier one that declared `x`.)
   Trimming also *increased* retained heap (111 vs 72 KB/submission) and left the tip unable to
   resolve its own vars. **Conclusion: per-submission managed retention is NOT reducible while
   preserving script semantics.** The ~77 % is reclaimable ONLY by dropping the whole chain
   (compaction), exactly as [kernel-memory-redesign.md](kernel-memory-redesign.md) concluded.

## What option 3 actually buys (honest value — post-spike)

The custom host, **on its own, delivers no steady-state memory win** over `CSharpScript`: the
`previousScriptCompilation` chain must be retained for script scoping (finding #4) and its
compilations can't be trimmed (finding #5). Switching hosts alone is pointless for memory.

Its value is strictly as an **enabler**, realised only when paired with compaction (Phase 4):
- **Ownership of the state array + chain reference** makes the generational compaction / reseed
  from the redesign doc *implementable* — `CSharpScript`'s opaque internals forbid it.
- **A collectible ALC per generation** lets a compaction (or reset) also unload the emitted
  assemblies — reclaiming the ~23 % loader heap that even `reset` can't free today.

So the prize of the **full** effort (host + compaction) is: **reclaim ~100 % mid-session
without a process restart AND without losing live variable values or re-running cells** — a
better-than-`reset` reclamation for long migrations where re-running is expensive. It carries
the redesign doc's inherent limit: variables of anonymous / cell-defined types can't be rebound
across the chain-drop (cross-assembly identity) and degrade to `dynamic` or are dropped.

**Corollary:** do not build the host as a standalone deliverable. It is Phase 0–2 of a single
effort whose payoff is Phase 4. If we are not going to do compaction, there is no reason to
replace `CSharpScript`, and `Reset Kernel` (already reclaims ~77 %, free) remains the answer.

**Update (post-scoping, shipped separately):** the *re-run retained-object* half of the leak
(Leak A) turned out NOT to need the host at all — `ScriptVariable.Value` has a public setter
that writes through to the submission field, so shadowed bindings can be nulled directly
(`PruneShadowedVariables`, shipped; Experiment A re-measured 547 MB → 62 MB). This shrinks
the host+compaction prize to what pruning cannot reach: the **compilation graph**
(~1 MB/submission, Leak B) and the **loader heap** (~23 %). The go/no-go question is now
"is ~1 MB per executed cell + the loader heap worth the host+compaction effort?" — a much
weaker case than before; long sessions that hit it are served by the one-click restart.

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

- **Phase 0 — spike #1 (retention): DONE, negative.** Prior compilations cannot be trimmed
  (finding #5). Consequence: there is no per-submission retention win; the effort is justified
  ONLY if we commit to Phase 4 (compaction). Decision gate now reads: *proceed only if we
  intend to ship compaction; otherwise stop and rely on `Reset Kernel`.*
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

- **Retention (spike #1)** — RESOLVED negative: trimming is impossible, so the effort reduces
  to "host as enabler for compaction". This is now a scoping conclusion, not an open risk.
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
