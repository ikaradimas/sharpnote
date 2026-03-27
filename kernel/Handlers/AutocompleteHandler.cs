using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace SharpNoteKernel;

partial class Program
{
    internal static async Task HandleAutocomplete(JsonElement msg, TextWriter realStdout)
    {
        var requestId = msg.GetProperty("requestId").GetString()!;
        var code      = msg.GetProperty("code").GetString()!;
        var position  = msg.GetProperty("position").GetInt32();

        _workspaceManager.UpdateDocument(code);
        var completions = await _workspaceManager.GetCompletionsAsync(position);

        var items = completions
            .Select(c => new { label = c.Label, type = c.Kind, detail = c.Detail })
            .ToList();

        realStdout.WriteLine(JsonSerializer.Serialize(new
        { type = "autocomplete_result", requestId, items }));
    }
}
