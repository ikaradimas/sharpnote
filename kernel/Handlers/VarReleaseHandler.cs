using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using Microsoft.CodeAnalysis.Scripting;

namespace SharpNoteKernel;

partial class Program
{
    /// <summary>
    /// Frees a variable by nulling its bindings directly on the script state:
    /// <see cref="ScriptVariable.Value"/> has a public setter that writes through to the
    /// underlying submission field, so no synthetic submission is compiled (no chain
    /// growth, ~1 MB of compilation avoided per release) and the name needs no source
    /// escaping (keyword-named variables like <c>var @class</c> just work).
    ///
    /// The CURRENT binding is nulled only when reference-typed — nulling an <c>int</c>
    /// frees nothing and would surprisingly zero a live value. SHADOWED bindings (older
    /// copies left by re-declaration, unreachable by name from user code) are cleared
    /// unconditionally; zeroing a dead struct also releases references it wraps (e.g.
    /// an ImmutableArray's buffer). Returns true when the current binding was freed.
    /// </summary>
    internal static bool ReleaseVariableBindings(ScriptState state, string name)
    {
        var bindings = state.Variables.Where(v => v.Name == name).ToList();
        var freedCurrent = false;
        for (var i = 0; i < bindings.Count; i++)
        {
            var b = bindings[i];
            var isCurrent = i == bindings.Count - 1;
            if (isCurrent && b.Type.IsValueType) continue; // nothing to free
            try
            {
                b.Value = null; // throws for readonly/const — caught below, binding left as-is
                if (isCurrent) freedCurrent = true;
            }
            catch (InvalidOperationException) { /* readonly or const binding */ }
            catch (Exception) { /* exotic field — leave untouched */ }
        }
        return freedCurrent;
    }

    /// <summary>
    /// Nulls every SHADOWED variable binding — the older copies left behind each time a
    /// cell re-declares a variable (every re-run of a declaring cell does this). Roslyn's
    /// chained ScriptState roots those copies forever, so re-running a cell that loads
    /// large data retained every previous run's copy — the dominant measured leak
    /// (~size-of-data per re-run; see tasks/kernel-memory-redesign.md). Called after each
    /// successful chain advance, so shadowed data dies with the run that shadowed it.
    ///
    /// Primitive/enum shadowed bindings are skipped (no references inside, nothing to
    /// free); all other value types are zeroed since a struct can wrap references.
    ///
    /// Caveat (documented in the Kernel docs): a delegate created BEFORE a re-declaration
    /// reads the old binding, and will now observe null instead of the previous run's
    /// stale value. The stale-cell tracker already flags such capturing cells for re-run.
    /// </summary>
    internal static int PruneShadowedVariables(ScriptState state)
    {
        var pruned = 0;
        foreach (var group in state.Variables.GroupBy(v => v.Name))
        {
            var bindings = group.ToList();
            for (var i = 0; i < bindings.Count - 1; i++) // all but the current (last)
            {
                var v = bindings[i];
                if (v.Type.IsPrimitive || v.Type.IsEnum) continue;    // holds no references
                try
                {
                    if (!v.Type.IsValueType && v.Value == null) continue; // already clear
                    v.Value = null;
                    pruned++;
                }
                catch (InvalidOperationException) { /* readonly or const binding */ }
                catch (Exception) { /* exotic field — leave untouched */ }
            }
        }
        return pruned;
    }

    /// <summary>
    /// Handles the renderer's var_release message (the inspector's Free button): frees the
    /// named variable's bindings and emits a fresh vars_update so the popup shows the freed
    /// value. A silent no-op when the variable doesn't exist or nothing has run yet.
    /// </summary>
    internal static void HandleVarRelease(JsonElement msg, TextWriter realStdout)
    {
        var name = msg.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;
        if (string.IsNullOrEmpty(name) || script == null) return;
        if (!script.Variables.Any(v => v.Name == name)) return; // nothing to free

        ReleaseVariableBindings(script, name);
        EmitVarsUpdate(script, realStdout);
    }
}
