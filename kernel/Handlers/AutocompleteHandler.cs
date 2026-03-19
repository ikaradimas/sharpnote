using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;
using PolyglotKernel;

namespace PolyglotKernel;

partial class Program
{
    // ── C# keywords ───────────────────────────────────────────────────────────

    private static readonly string[] CSharpKeywords =
    {
        "abstract", "as", "async", "await", "base", "bool", "break", "byte",
        "case", "catch", "char", "checked", "class", "const", "continue",
        "decimal", "default", "delegate", "do", "double", "else", "enum",
        "event", "explicit", "extern", "false", "finally", "fixed", "float",
        "for", "foreach", "goto", "if", "implicit", "in", "int", "interface",
        "internal", "is", "lock", "long", "namespace", "new", "null", "object",
        "operator", "out", "override", "params", "private", "protected",
        "public", "readonly", "ref", "return", "sbyte", "sealed", "short",
        "sizeof", "stackalloc", "static", "string", "struct", "switch", "this",
        "throw", "true", "try", "typeof", "uint", "ulong", "unchecked",
        "unsafe", "ushort", "using", "var", "virtual", "void", "volatile", "while",
    };

    // Well-known static types for member completion
    private static readonly Dictionary<string, Type> WellKnownTypes =
        new(StringComparer.Ordinal)
        {
            ["Console"] = typeof(Console),
            ["Math"] = typeof(Math),
            ["Convert"] = typeof(Convert),
            ["String"] = typeof(string),
            ["string"] = typeof(string),
            ["int"] = typeof(int),
            ["double"] = typeof(double),
            ["Array"] = typeof(Array),
            ["Enumerable"] = typeof(Enumerable),
            ["File"] = typeof(System.IO.File),
            ["Directory"] = typeof(System.IO.Directory),
            ["Path"] = typeof(System.IO.Path),
            ["Environment"] = typeof(Environment),
            ["DateTime"] = typeof(DateTime),
            ["TimeSpan"] = typeof(TimeSpan),
            ["Regex"] = typeof(Regex),
            ["JsonSerializer"] = typeof(JsonSerializer),
            ["Display"] = typeof(DisplayHelper),
        };

    // ── Autocomplete handler ──────────────────────────────────────────────────

    internal static void HandleAutocomplete(JsonElement msg, TextWriter realStdout)
    {
        var requestId = msg.GetProperty("requestId").GetString()!;
        var acCode    = msg.GetProperty("code").GetString()!;
        var acPos     = msg.GetProperty("position").GetInt32();
        var items     = GetAutocompletions(acCode, acPos, script);
        realStdout.WriteLine(JsonSerializer.Serialize(new
        { type = "autocomplete_result", requestId, items }));
    }

    internal static List<object> GetAutocompletions(string code, int position, ScriptState<object?>? state)
    {
        var textBefore = position <= code.Length ? code[..position] : code;

        // Member access: "expr." or "expr.partial"
        var memberMatch = Regex.Match(textBefore, @"\b(\w+)\.(\w*)$");
        if (memberMatch.Success)
        {
            var objName = memberMatch.Groups[1].Value;
            var members = GetMembersForExpr(objName, state);
            if (members.Count > 0) return members;
        }

        // General context: keywords + state variables
        var items = new List<object>();
        foreach (var kw in CSharpKeywords)
            items.Add(new { label = kw, type = "keyword", detail = (string?)null });

        if (state != null)
        {
            foreach (var v in state.Variables)
            {
                items.Add(new
                {
                    label  = v.Name,
                    type   = "variable",
                    detail = v.Type?.Name,
                });
            }
        }

        return items;
    }

    internal static List<object> GetMembersForExpr(string name, ScriptState<object?>? state)
    {
        // Try live variable
        if (state != null)
        {
            var v = state.Variables.FirstOrDefault(
                x => string.Equals(x.Name, name, StringComparison.Ordinal));
            if (v?.Value != null)
                return ReflectMembers(v.Value.GetType(), isStatic: false);
        }

        // Try well-known static type
        if (WellKnownTypes.TryGetValue(name, out var type))
            return ReflectMembers(type, isStatic: true);

        return new List<object>();
    }

    internal static List<object> ReflectMembers(Type type, bool isStatic)
    {
        var flags = BindingFlags.Public |
                    (isStatic ? BindingFlags.Static : BindingFlags.Instance);
        var seen  = new HashSet<string>(StringComparer.Ordinal);
        var items = new List<object>();

        foreach (var m in type.GetMembers(flags))
        {
            if (m.Name.StartsWith('_') || !seen.Add(m.Name)) continue;

            var (kind, detail) = m switch
            {
                MethodInfo mi when !mi.IsSpecialName =>
                    ("function", mi.ReturnType.Name),
                PropertyInfo pi =>
                    ("property", pi.PropertyType.Name),
                FieldInfo fi =>
                    ("variable", fi.FieldType.Name),
                _ => ("", null)
            };

            if (kind == "") continue;
            items.Add(new { label = m.Name, type = kind, detail });
        }

        // LINQ extension methods for IEnumerable types
        if (!isStatic && typeof(IEnumerable).IsAssignableFrom(type))
        {
            foreach (var m in typeof(Enumerable)
                .GetMethods(BindingFlags.Public | BindingFlags.Static)
                .Where(m => !m.IsSpecialName && seen.Add(m.Name)))
            {
                items.Add(new { label = m.Name, type = "function", detail = "LINQ" });
            }
        }

        return items;
    }
}
