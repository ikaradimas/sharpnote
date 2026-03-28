using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis.Scripting;
using SharpNoteKernel;

namespace SharpNoteKernel;

partial class Program
{
    // Well-known static types for member completion (used by signature help)
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
            ["JsonSerializer"] = typeof(System.Text.Json.JsonSerializer),
        };

    internal static void HandleSignature(JsonElement msg, TextWriter realStdout)
    {
        var requestId = msg.GetProperty("requestId").GetString()!;
        var code      = msg.GetProperty("code").GetString()!;
        var pos       = msg.GetProperty("position").GetInt32();
        var (sigs, activeParam) = GetSignatureHelp(code, pos, script);
        realStdout.WriteLine(JsonSerializer.Serialize(new
        { type = "signature_result", requestId, signatures = sigs, activeParam }));
    }

    internal static (List<object> Signatures, int ActiveParam) GetSignatureHelp(
        string code, int position, ScriptState<object?>? state)
    {
        var empty = (new List<object>(), 0);
        var textBefore = position <= code.Length ? code[..position] : code;

        // Find innermost unclosed '('
        int depth = 0, parenPos = -1;
        for (int i = textBefore.Length - 1; i >= 0; i--)
        {
            if (textBefore[i] == ')') depth++;
            else if (textBefore[i] == '(')
            {
                if (depth == 0) { parenPos = i; break; }
                depth--;
            }
        }
        if (parenPos < 0) return empty;

        // Count active parameter index (commas at depth 0)
        int activeParam = 0, innerDepth = 0;
        for (int i = parenPos + 1; i < textBefore.Length; i++)
        {
            char c = textBefore[i];
            if (c == '(' || c == '[' || c == '{') innerDepth++;
            else if (c == ')' || c == ']' || c == '}') innerDepth--;
            else if (c == ',' && innerDepth == 0) activeParam++;
        }

        // Extract obj.Method or just Method from text before '('
        var exprBefore = textBefore[..parenPos].TrimEnd();
        var memberMatch = Regex.Match(exprBefore, @"(\w+)\.(\w+)$");
        if (!memberMatch.Success) return empty;

        var objName    = memberMatch.Groups[1].Value;
        var methodName = memberMatch.Groups[2].Value;
        var overloads  = GetMethodOverloads(objName, methodName, state);
        if (overloads.Count == 0) return empty;

        var sigs = overloads.Select(m =>
        {
            var parms = m.GetParameters()
                .Select(p => new { label = $"{FriendlyTypeName(p.ParameterType)} {p.Name}" })
                .ToList<object>();
            var label = $"{m.Name}({string.Join(", ", m.GetParameters().Select(p => $"{FriendlyTypeName(p.ParameterType)} {p.Name}"))}): {FriendlyTypeName(m.ReturnType)}";
            return (object)new { label, parameters = parms };
        }).ToList();

        return (sigs, activeParam);
    }

    private static List<MethodInfo> GetMethodOverloads(
        string objName, string methodName, ScriptState<object?>? state)
    {
        Type? type = null;

        if (state != null)
        {
            var v = state.Variables.FirstOrDefault(
                x => string.Equals(x.Name, objName, StringComparison.Ordinal));
            if (v != null) type = v.Value?.GetType() ?? v.Type;
        }

        if (type == null && WellKnownTypes.TryGetValue(objName, out var wk))
            type = wk;

        if (type == null)
        {
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies()
                .Where(a => string.IsNullOrEmpty(a.Location)))
            {
                try
                {
                    type = asm.GetTypes().FirstOrDefault(
                        t => string.Equals(t.Name, objName, StringComparison.Ordinal));
                    if (type != null) break;
                }
                catch { }
            }
        }

        if (type == null) return new List<MethodInfo>();

        return type
            .GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.Instance)
            .Where(m => string.Equals(m.Name, methodName, StringComparison.OrdinalIgnoreCase)
                     && !m.IsSpecialName)
            .OrderBy(m => m.GetParameters().Length)
            .ToList();
    }

    private static string FriendlyTypeName(Type t)
    {
        if (t == typeof(void))    return "void";
        if (t == typeof(string))  return "string";
        if (t == typeof(int))     return "int";
        if (t == typeof(long))    return "long";
        if (t == typeof(double))  return "double";
        if (t == typeof(float))   return "float";
        if (t == typeof(bool))    return "bool";
        if (t == typeof(object))  return "object";
        if (t == typeof(decimal)) return "decimal";
        if (t.IsGenericType)
        {
            var name = t.Name[..t.Name.IndexOf('`')];
            var args = string.Join(", ", t.GetGenericArguments().Select(FriendlyTypeName));
            return $"{name}<{args}>";
        }
        return t.Name;
    }
}
