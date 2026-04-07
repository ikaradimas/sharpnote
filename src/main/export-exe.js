'use strict';

/**
 * Generates a standalone .NET console project from notebook code cells.
 *
 * Output files:
 *   Program.cs      — merged cell code as top-level statements
 *   ConsoleStubs.cs — Display/Log/Dump stubs targeting Console
 *   {name}.csproj   — project file with NuGet references
 */

const NUGET_DIRECTIVE_RE = /^\s*#r\s+"nuget:\s*[^"]+"\s*$/gm;

/**
 * In Roslyn scripting, a cell's last line without a trailing semicolon is an
 * auto-displayed return expression. In compiled C# that's invalid — wrap it
 * in Console.WriteLine() so the value prints and the code compiles.
 */
function wrapTrailingExpression(code) {
  const codeLines = code.split('\n');
  // Find last non-empty, non-comment line
  let lastIdx = -1;
  for (let i = codeLines.length - 1; i >= 0; i--) {
    const trimmed = codeLines[i].trim();
    if (trimmed && !trimmed.startsWith('//')) { lastIdx = i; break; }
  }
  if (lastIdx < 0) return code;

  const lastLine = codeLines[lastIdx].trimEnd();
  // If the line already ends with ; { } it's a normal statement — leave it
  if (/[;{}]\s*$/.test(lastLine)) return code;
  // If it's blank or a preprocessor directive, leave it
  if (!lastLine.trim() || lastLine.trim().startsWith('#')) return code;

  // It's a trailing expression — wrap in Console.WriteLine
  const indent = lastLine.match(/^(\s*)/)[1];
  codeLines[lastIdx] = `${indent}Console.WriteLine(${lastLine.trim()});`;
  return codeLines.join('\n');
}

function slugify(name) {
  return name
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .trim()
    .replace(/\s+/g, '-') || 'notebook-export';
}

function generateProgramCs(cells, config, title) {
  const lines = [];
  lines.push(`// Auto-generated from SharpNote notebook: ${title}`);
  lines.push(`// Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('using System;');
  lines.push('using System.Collections;');
  lines.push('using System.Collections.Generic;');
  lines.push('using System.Linq;');
  lines.push('using System.Text;');
  lines.push('using System.IO;');
  lines.push('using System.Threading.Tasks;');
  lines.push('using System.Text.Json;');
  lines.push('using System.Net;');
  lines.push('using System.Net.Http;');
  lines.push('');

  // Config dictionary
  if (config.length > 0) {
    lines.push('// ── Notebook Config ──────────────────────────────────────────────────────────');
    lines.push('var Config = new Dictionary<string, string> {');
    for (const entry of config) {
      const escaped = entry.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      lines.push(`    ["${entry.key}"] = "${escaped}",`);
    }
    lines.push('};');
    lines.push('');
  }

  // Cell code
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const label = cell.name || `Cell ${i + 1}`;
    lines.push(`// ── ${label} ${'─'.repeat(Math.max(1, 68 - label.length))}──`);
    // Strip #r "nuget: ..." directives (handled by .csproj)
    const code = (cell.content || '').replace(NUGET_DIRECTIVE_RE, '').trim();
    if (code) lines.push(wrapTrailingExpression(code));
    lines.push('');
  }

  return lines.join('\n');
}

function generateConsoleStubsCs() {
  return `// Console stubs for SharpNote Display/Log/Dump APIs.
// These replace the interactive notebook APIs with console-friendly output.

using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

public static class Display
{
    public static void Html(string html, string? title = null)
    {
        var text = Regex.Replace(html, "<[^>]+>", " ");
        text = Regex.Replace(text.Trim(), @"\\s{2,}", " ");
        if (title != null) Console.WriteLine($"── {title} ──");
        if (!string.IsNullOrWhiteSpace(text)) Console.WriteLine(text);
    }

    public static void Table(object rows, string? title = null)
    {
        if (title != null) Console.WriteLine($"── {title} ──");
        if (rows is IEnumerable enumerable)
        {
            var items = enumerable.Cast<object>().ToList();
            if (items.Count == 0) { Console.WriteLine("(empty)"); return; }

            // Extract property names from first item
            var props = items[0].GetType().GetProperties();
            if (props.Length == 0) { foreach (var item in items) Console.WriteLine(item); return; }

            var headers = props.Select(p => p.Name).ToArray();
            var widths = headers.Select(h => h.Length).ToArray();
            var rows2d = new List<string[]>();
            foreach (var item in items)
            {
                var vals = props.Select(p => (p.GetValue(item)?.ToString() ?? "")).ToArray();
                for (int i = 0; i < vals.Length; i++)
                    widths[i] = Math.Max(widths[i], vals[i].Length);
                rows2d.Add(vals);
            }

            var sep = string.Join("─┼─", widths.Select(w => new string('─', w + 1)));
            Console.WriteLine(" " + string.Join(" │ ", headers.Select((h, i) => h.PadRight(widths[i]))));
            Console.WriteLine("─" + sep + "─");
            foreach (var row in rows2d)
                Console.WriteLine(" " + string.Join(" │ ", row.Select((v, i) => v.PadRight(widths[i]))));
        }
        else
        {
            Console.WriteLine(rows);
        }
    }

    public static void Csv(string csv, string? title = null)
    {
        if (title != null) Console.WriteLine($"── {title} ──");
        Console.WriteLine(csv);
    }

    public static void Markdown(string md, string? title = null)
    {
        if (title != null) Console.WriteLine($"── {title} ──");
        Console.WriteLine(md);
    }

    public static void Image(string src, string? alt = null, int? width = null, int? height = null)
        => Console.WriteLine($"[Image: {alt ?? src}]");

    public static void Plot(string name, double value, string? mode = null,
        string? axis = null, string? type = null)
        => Console.WriteLine($"  {name}: {value}");

    public static void Graph(object config, string? title = null)
        => Console.WriteLine("[Graph output — not available in console mode]");
}

public static class DisplayExtensions
{
    public static T Display<T>(this T obj, string? title = null)
    {
        if (title != null) Console.Write($"{title}: ");
        Console.WriteLine(obj);
        return obj;
    }

    public static T Dump<T>(this T obj, string? title = null) => obj.Display(title);

    public static T Log<T>(this T obj, string? label = null)
    {
        Console.Error.WriteLine(label != null ? $"[{label}] {obj}" : $"{obj}");
        return obj;
    }

    public static void DisplayTable<T>(this IEnumerable<T> items, string? title = null)
        => global::Display.Table(items, title);

    public static void DumpTable<T>(this IEnumerable<T> items, string? title = null)
        => global::Display.Table(items, title);
}
`;
}

function generateCsproj(projectName, packages) {
  const lines = [];
  lines.push('<Project Sdk="Microsoft.NET.Sdk">');
  lines.push('  <PropertyGroup>');
  lines.push('    <OutputType>Exe</OutputType>');
  lines.push('    <TargetFramework>net10.0</TargetFramework>');
  lines.push('    <ImplicitUsings>disable</ImplicitUsings>');
  lines.push('    <Nullable>enable</Nullable>');
  lines.push('  </PropertyGroup>');
  if (packages.length > 0) {
    lines.push('  <ItemGroup>');
    for (const pkg of packages) {
      const ver = pkg.version ? ` Version="${pkg.version}"` : '';
      lines.push(`    <PackageReference Include="${pkg.id}"${ver} />`);
    }
    lines.push('  </ItemGroup>');
  }
  lines.push('</Project>');
  lines.push('');
  return lines.join('\n');
}

function generateExecutableProject({ cells, packages, config, title }) {
  const name = slugify(title);
  return {
    'Program.cs':      generateProgramCs(cells, config, title),
    'ConsoleStubs.cs':  generateConsoleStubsCs(),
    [`${name}.csproj`]: generateCsproj(name, packages),
  };
}

module.exports = { generateExecutableProject, slugify, generateProgramCs, generateCsproj, generateConsoleStubsCs };
