using System.IO;
using System.Text.Json;

namespace SharpNoteKernel;

/// <summary>Panel ID constants — pass to <see cref="PanelsHelper"/> methods.</summary>
public static class PanelId
{
    public const string Log       = "log";
    public const string Packages  = "nuget";
    public const string Config    = "config";
    public const string Db        = "db";
    public const string Library   = "library";
    public const string Variables = "vars";
    public const string Toc       = "toc";
    public const string Files     = "files";
    public const string Api       = "api";
    public const string Graph     = "graph";
    public const string Todo      = "todo";
}

/// <summary>
/// Controls panel visibility in the SharpNote UI.
/// Exposed to scripts as the global <c>Panels</c> variable.
/// </summary>
public class PanelsHelper
{
    private readonly TextWriter _out;

    public PanelsHelper(TextWriter output) => _out = output;

    /// <summary>Opens the panel identified by <paramref name="panelId"/>. Has no effect if already open.</summary>
    public void Open(string panelId)   => Send("panel_open",   panelId);

    /// <summary>Closes the panel identified by <paramref name="panelId"/>. Has no effect if already closed.</summary>
    public void Close(string panelId)  => Send("panel_close",  panelId);

    /// <summary>Toggles the panel identified by <paramref name="panelId"/> between open and closed.</summary>
    public void Toggle(string panelId) => Send("panel_toggle", panelId);

    private void Send(string type, string panel) =>
        _out.WriteLine(JsonSerializer.Serialize(new { type, panel }));
}
