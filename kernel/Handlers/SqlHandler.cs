using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;
using SharpNoteKernel;

namespace SharpNoteKernel;

partial class Program
{
    internal static async Task HandleExecuteSql(
        JsonElement msg,
        ScriptOptions options,
        ScriptGlobals globals,
        TextWriter realStdout)
    {
        var cellId    = msg.TryGetProperty("id",      out var cid)  ? cid.GetString()     : null;
        var sql       = msg.TryGetProperty("sql",     out var sqlP) ? sqlP.GetString()    : "";
        var varName   = msg.TryGetProperty("varName", out var vn)   ? vn.GetString()      : "";

        if (string.IsNullOrWhiteSpace(varName))
        {
            realStdout.WriteLine(JsonSerializer.Serialize(new
            {
                type = "error", id = cellId,
                message = "SQL cell: no database selected or database not ready.",
            }));
            realStdout.WriteLine(JsonSerializer.Serialize(new { type = "complete", id = cellId, success = false }));
            return;
        }

        CurrentCellId = cellId;
        var display = new DisplayHelper(realStdout);
        display.SetCellId(cellId ?? "");
        DisplayContext.Current = display;

        try
        {
            // Escape the SQL for inclusion in a C# verbatim string (double up double-quotes)
            var escapedSql = (sql ?? "").Replace("\"", "\"\"");

            var code = $$"""
{
    var __sql_conn__ = {{varName}}.Database.GetDbConnection();
    var __sql_was_open__ = __sql_conn__.State == System.Data.ConnectionState.Open;
    if (!__sql_was_open__) await __sql_conn__.OpenAsync();
    try
    {
        using var __sql_cmd__ = __sql_conn__.CreateCommand();
        __sql_cmd__.CommandText = @"{{escapedSql}}";
        using var __sql_reader__ = await __sql_cmd__.ExecuteReaderAsync();
        var __sql_cols__ = Enumerable.Range(0, __sql_reader__.FieldCount)
            .Select(i => __sql_reader__.GetName(i)).ToList();
        var __sql_rows__ = new List<Dictionary<string, object?>>();
        while (await __sql_reader__.ReadAsync())
        {
            var __sql_row__ = new Dictionary<string, object?>();
            for (int __i__ = 0; __i__ < __sql_reader__.FieldCount; __i__++)
                __sql_row__[__sql_cols__[__i__]] = __sql_reader__.IsDBNull(__i__) ? null : __sql_reader__.GetValue(__i__);
            __sql_rows__.Add(__sql_row__);
        }
        if (__sql_rows__.Count > 0)
        {
            __sql_rows__.DisplayTable();
        }
        else
        {
            var __sql_aff__ = __sql_reader__.RecordsAffected;
            Display.Html($"<div class=\"sql-status\">{(__sql_aff__ >= 0 ? $"{__sql_aff__} row{(__sql_aff__ == 1 ? "" : "s")} affected" : "Query executed.")}</div>");
        }
    }
    finally
    {
        if (!__sql_was_open__) await __sql_conn__.CloseAsync();
    }
}
""";

            var opts = options.AddReferences(dbMetaRefs);
            if (script == null)
                script = await CSharpScript.RunAsync<object?>(code, opts, globals, typeof(ScriptGlobals));
            else
                script = await script.ContinueWithAsync<object?>(code, opts);

            realStdout.WriteLine(JsonSerializer.Serialize(new { type = "complete", id = cellId, success = true }));
        }
        catch (Exception ex)
        {
            var inner = ex is AggregateException agg ? agg.InnerException ?? ex : ex;
            realStdout.WriteLine(JsonSerializer.Serialize(new
            {
                type       = "error",
                id         = cellId,
                message    = inner.Message,
                stackTrace = inner.StackTrace,
            }));
            realStdout.WriteLine(JsonSerializer.Serialize(new { type = "complete", id = cellId, success = false }));
        }
        finally
        {
            CurrentCellId = null;
            DisplayContext.Current = null;
        }
    }
}
