using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis.Scripting;

namespace SharpNoteKernel;

partial class Program
{
    // Matches a plain C# identifier. `name` is interpolated into compiled source in
    // HandleVarRelease, so this guard is load-bearing — it rejects any non-identifier
    // (and therefore any code-injection) input.
    private static readonly Regex _releaseNameRe = new(@"^[A-Za-z_][A-Za-z0-9_]*$", RegexOptions.Compiled);

    /// <summary>
    /// Frees a variable's CURRENT value by running a synthetic <c>name = null;</c> submission,
    /// dropping the object it referenced (if nothing else holds it) without restarting the
    /// kernel. Emits a fresh vars_update so the renderer reflects the freed value.
    ///
    /// A safe no-op when the variable doesn't exist or can't be assigned null (e.g. a
    /// non-nullable value type or a const): the throwing submission is never assigned back
    /// to <c>script</c>, so accumulated state is left untouched. Note this frees only the
    /// current binding — shadowed copies left by re-running the declaring cell are cleared
    /// only by restarting the kernel (see tasks/kernel-memory-redesign.md).
    /// </summary>
    internal static async Task HandleVarRelease(JsonElement msg, ScriptOptions options, ScriptGlobals globals, TextWriter realStdout)
    {
        var name = msg.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;
        if (string.IsNullOrEmpty(name) || script == null) return;
        if (!_releaseNameRe.IsMatch(name)) return;               // injection guard
        if (!script.Variables.Any(v => v.Name == name)) return;  // nothing to free

        try
        {
            var effectiveOptions = options.AddReferences(dbMetaRefs);
            // Prefix with @ (verbatim identifier) so keyword-named variables — e.g.
            // `var @class = …`, whose ScriptVariable.Name is "class" — compile as
            // `@class = null;` instead of the reserved word `class = null;`. Harmless for
            // ordinary names (@foo ≡ foo).
            script = await script.ContinueWithAsync<object?>($"@{name} = null;", effectiveOptions);
        }
        catch (CompilationErrorException)
        {
            // Non-nullable value type / const / read-only: can't be nulled. `script` is
            // unchanged (the throwing task was never assigned back), and there is nothing
            // to free anyway — fall through and re-emit the (unchanged) variable snapshot.
        }
        catch (Exception ex)
        {
            realStdout.WriteLine(JsonSerializer.Serialize(new { type = "var_release_error", name, message = ex.Message }));
            return;
        }

        if (script != null) EmitVarsUpdate(script, realStdout);
    }
}
