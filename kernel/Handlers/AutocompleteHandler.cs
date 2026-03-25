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
using SharpNoteKernel;

namespace SharpNoteKernel;

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

        // Member access: "expr." or "expr.partial" — always return member list (may be empty)
        var memberMatch = Regex.Match(textBefore, @"\b(\w+)\.(\w*)$");
        if (memberMatch.Success)
        {
            var objName = memberMatch.Groups[1].Value;
            return GetMembersForExpr(objName, state);
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
        // Try live variable — use runtime type if value is available, declared type otherwise
        if (state != null)
        {
            var v = state.Variables.FirstOrDefault(
                x => string.Equals(x.Name, name, StringComparison.Ordinal));
            if (v != null)
            {
                var type = v.Value?.GetType() ?? v.Type;
                if (type != null)
                    return ReflectMembers(type, isStatic: false);
            }
        }

        // Try well-known static type
        if (WellKnownTypes.TryGetValue(name, out var wellKnown))
            return ReflectMembers(wellKnown, isStatic: true);

        // Try user-defined types from Roslyn script assemblies (dynamic / in-memory)
        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies()
            .Where(a => string.IsNullOrEmpty(a.Location)))
        {
            try
            {
                var t = asm.GetTypes().FirstOrDefault(
                    t => string.Equals(t.Name, name, StringComparison.Ordinal));
                if (t != null)
                    return ReflectMembers(t, isStatic: true);
            }
            catch { /* skip assemblies that throw on GetTypes */ }
        }

        return new List<object>();
    }

    internal static List<object> ReflectMembers(Type type, bool isStatic)
    {
        // Enum types expose their values as public static fields; include both
        // static and instance so callers get the enum values AND System.Enum methods.
        var flags = BindingFlags.Public |
                    (isStatic || type.IsEnum ? BindingFlags.Static : BindingFlags.Instance);
        if (type.IsEnum)
            flags |= BindingFlags.Instance; // also include ToString, GetType, etc.

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
                    (type.IsEnum ? "enum" : "variable", fi.FieldType.Name),
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
