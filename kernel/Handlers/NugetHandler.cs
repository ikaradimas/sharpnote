using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis.Scripting;
using PolyglotKernel;

namespace PolyglotKernel;

partial class Program
{
    // ── #r "nuget: ..." parsing ───────────────────────────────────────────────

    internal static (string cleanCode, List<(string id, string? version)> refs)
        ParseNugetDirectives(string code)
    {
        var refs = new List<(string, string?)>();
        var lines = code.Split('\n');
        var clean = new List<string>(lines.Length);

        foreach (var line in lines)
        {
            var m = Regex.Match(line.Trim(),
                @"^#r\s+""nuget:\s*([^,""\s]+?)(?:\s*,\s*([^""]+?))?\s*""",
                RegexOptions.IgnoreCase);
            if (m.Success)
            {
                refs.Add((m.Groups[1].Value.Trim(),
                          m.Groups[2].Success ? m.Groups[2].Value.Trim() : null));
                clean.Add(""); // preserve line numbers
            }
            else
            {
                clean.Add(line);
            }
        }

        return (string.Join('\n', clean), refs);
    }

    // ── NuGet package loader ──────────────────────────────────────────────────

    internal static async Task<(ScriptOptions opts, string? error)> LoadNuGetAsync(
        string packageId, string? version, ScriptOptions options,
        string cellId, TextWriter realStdout, IEnumerable<string>? sourceUrls = null)
    {
        var key = $"{packageId.ToLower()}/{version ?? "*"}";
        if (_loadedNugetKeys.Contains(key)) return (options, null);

        var tempDir = Path.Combine(Path.GetTempPath(), $"pg_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);

        try
        {
            var verAttr = version != null ? $" Version=\"{version}\"" : "";
            await File.WriteAllTextAsync(Path.Combine(tempDir, "r.csproj"),
                $"""
                <Project Sdk="Microsoft.NET.Sdk">
                  <PropertyGroup>
                    <TargetFramework>net8.0</TargetFramework>
                    <ImplicitUsings>disable</ImplicitUsings>
                    <Nullable>disable</Nullable>
                  </PropertyGroup>
                  <ItemGroup>
                    <PackageReference Include="{packageId}"{verAttr} />
                  </ItemGroup>
                </Project>
                """);

            var srcArgs = sourceUrls?
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => $"--source \"{s}\"")
                .ToList() ?? new List<string>();
            var srcArgStr = srcArgs.Count > 0 ? " " + string.Join(" ", srcArgs) : "";

            using var proc = new Process
            {
                StartInfo = new ProcessStartInfo("dotnet", $"restore r.csproj --nologo -v q{srcArgStr}")
                {
                    WorkingDirectory = tempDir,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                }
            };
            proc.Start();

            // Read stdout/stderr concurrently to avoid deadlock
            var stdoutTask = proc.StandardOutput.ReadToEndAsync();
            var stderrTask = proc.StandardError.ReadToEndAsync();
            await proc.WaitForExitAsync();
            var stderr = await stderrTask;
            await stdoutTask;

            if (proc.ExitCode != 0)
                return (options, $"NuGet restore failed for {packageId}: {stderr.Trim()}");

            var assetsPath = Path.Combine(tempDir, "obj", "project.assets.json");
            if (!File.Exists(assetsPath))
                return (options, $"NuGet restore did not produce assets file for {packageId}");

            var dlls = GetDllsFromAssets(assetsPath);
            foreach (var dll in dlls.Where(File.Exists))
            {
                try { options = options.AddReferences(Assembly.LoadFrom(dll)); }
                catch { /* skip unloadable assemblies */ }
            }

            _loadedNugetKeys.Add(key);
            return (options, null);
        }
        catch (Exception ex)
        {
            return (options, $"NuGet error: {ex.Message}");
        }
        finally
        {
            try { Directory.Delete(tempDir, true); } catch { }
        }
    }

    // Parse project.assets.json and return all runtime DLL paths
    private static List<string> GetDllsFromAssets(string assetsPath)
    {
        var result = new List<string>();
        using var doc = JsonDocument.Parse(File.ReadAllText(assetsPath));
        var root = doc.RootElement;

        // Global packages folder (first key in packageFolders)
        string packageRoot = "";
        foreach (var folder in root.GetProperty("packageFolders").EnumerateObject())
        {
            packageRoot = folder.Name.TrimEnd('/', '\\', Path.DirectorySeparatorChar);
            break;
        }
        if (string.IsNullOrEmpty(packageRoot)) return result;

        var libraries = root.GetProperty("libraries");

        // Use the first (and only) target
        foreach (var target in root.GetProperty("targets").EnumerateObject())
        {
            foreach (var pkg in target.Value.EnumerateObject())
            {
                if (!libraries.TryGetProperty(pkg.Name, out var libInfo)) continue;
                if (!libInfo.TryGetProperty("path", out var pathEl)) continue;
                var libPath = pathEl.GetString()!;

                // Prefer runtime files; fall back to compile
                JsonElement files = default;
                bool found = pkg.Value.TryGetProperty("runtime", out files);
                if (!found) found = pkg.Value.TryGetProperty("compile", out files);
                if (!found) continue;

                foreach (var file in files.EnumerateObject())
                {
                    var rel = file.Name; // e.g. "lib/net6.0/Foo.dll"
                    if (rel == "_._") continue;
                    if (!rel.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)) continue;

                    var parts = new[] { packageRoot, libPath }
                        .Concat(rel.Split('/'))
                        .ToArray();
                    result.Add(Path.Combine(parts));
                }
            }
            break; // only first target
        }

        return result;
    }

    // ── preload_nugets handler ────────────────────────────────────────────────

    internal static async Task HandlePreloadNugets(
        JsonElement msg,
        ScriptOptions options,
        TextWriter realStdout,
        Action<ScriptOptions> setOptions)
    {
        var preloadSources = msg.TryGetProperty("sources", out var psProp)
            ? psProp.EnumerateArray().Select(s => s.GetString()!).ToList()
            : (List<string>?)null;
        var pkgList = msg.GetProperty("packages").EnumerateArray().ToList();
        foreach (var pkgEl in pkgList)
        {
            var pkgId  = pkgEl.GetProperty("id").GetString()!;
            var pkgVer = pkgEl.TryGetProperty("version", out var vProp)
                && vProp.ValueKind == JsonValueKind.String
                ? vProp.GetString() : null;

            realStdout.WriteLine(JsonSerializer.Serialize(new
            { type = "nuget_status", id = pkgId, version = pkgVer, status = "loading" }));
            LogContext.WriteNotebook($"NuGet preload: {pkgId} {pkgVer ?? "latest"}");

            var (updatedOpts, nugetErr) =
                await LoadNuGetAsync(pkgId, pkgVer, options, "__preload__", realStdout, preloadSources);

            if (nugetErr != null)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                { type = "nuget_status", id = pkgId, version = pkgVer,
                  status = "error", message = nugetErr }));
                LogContext.WriteNotebook($"NuGet preload error: {pkgId}: {nugetErr}");
            }
            else
            {
                options = updatedOpts;
                setOptions(options);
                realStdout.WriteLine(JsonSerializer.Serialize(new
                { type = "nuget_status", id = pkgId, version = pkgVer, status = "loaded" }));
                LogContext.WriteNotebook($"NuGet preload loaded: {pkgId}");
            }
        }
        realStdout.WriteLine(JsonSerializer.Serialize(new { type = "nuget_preload_complete" }));
    }
}
