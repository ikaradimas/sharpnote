using System.IO;
using System.Text.Json;

namespace SharpNoteKernel;

/// <summary>Panel ID constants — pass to <see cref="PanelsHelper"/> methods.</summary>
public static class PanelId
{
    public const string Log           = "log";
    public const string Packages      = "nuget";
    public const string Config        = "config";
    public const string Database      = "db";
    public const string Library       = "library";
    public const string Variables     = "vars";
    public const string Toc           = "toc";
    public const string Files         = "files";
    public const string Api           = "api";
    public const string ApiEditor     = "api-editor";
    public const string Git           = "git";
    public const string Graph         = "graph";
    public const string Todo          = "todo";
    public const string Regex         = "regex";
    public const string Kafka         = "kafka";
    public const string Orchestration = "deps";
    public const string History       = "history";
    public const string Embed         = "embed";

    [System.Obsolete("Use Database instead")] public const string Db = "db";
}

/// <summary>Dock zone constants — pass as the <c>zone</c> argument to <see cref="PanelsHelper.Dock"/>.</summary>
public static class DockZone
{
    public const string Left   = "left";
    public const string Right  = "right";
    public const string Bottom = "bottom";
}

/// <summary>
/// Controls panel visibility and layout in the SharpNote UI.
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

    /// <summary>Closes all open panels.</summary>
    public void CloseAll() =>
        _out.WriteLine(JsonSerializer.Serialize(new { type = "panel_close_all" }));

    /// <summary>
    /// Moves the panel to a dock zone.
    /// </summary>
    /// <param name="panelId">Panel to move — use <see cref="PanelId"/> constants.</param>
    /// <param name="zone">Target zone — use <see cref="DockZone"/> constants.</param>
    /// <param name="size">
    /// Optional size for the target zone.
    /// Values between 0 and 1 (exclusive) are treated as a fraction of the window dimension
    /// (width for left/right zones, height for the bottom zone).
    /// Values ≥ 1 are treated as absolute pixels.
    /// Omit to leave the current zone size unchanged.
    /// </param>
    public void Dock(string panelId, string zone, double? size = null) =>
        _out.WriteLine(JsonSerializer.Serialize(new { type = "panel_dock", panel = panelId, zone, size }));

    /// <summary>
    /// Floats the panel as a free-floating window.
    /// All position and size arguments are optional — omit any to keep its current value or use the default.
    /// </summary>
    /// <param name="panelId">Panel to float — use <see cref="PanelId"/> constants.</param>
    /// <param name="x">Left edge in pixels.</param>
    /// <param name="y">Top edge in pixels.</param>
    /// <param name="width">Panel width in pixels (minimum 260).</param>
    /// <param name="height">Panel height in pixels (minimum 150).</param>
    public void Float(string panelId, int? x = null, int? y = null, int? width = null, int? height = null) =>
        _out.WriteLine(JsonSerializer.Serialize(new { type = "panel_float", panel = panelId, x, y, w = width, h = height }));

    /// <summary>
    /// Opens the API Editor panel and loads a saved API by its ID or title.
    /// </summary>
    public void LoadApiEditor(string apiIdOrTitle)
    {
        Open(PanelId.ApiEditor);
        _out.WriteLine(JsonSerializer.Serialize(new { type = "api_editor_load", apiIdOrTitle }));
    }

    private void Send(string type, string panel) =>
        _out.WriteLine(JsonSerializer.Serialize(new { type, panel }));
}
