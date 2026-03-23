using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis.Scripting;
using NuGet.Common;
using NuGet.Configuration;
using NuGet.Frameworks;
using NuGet.Packaging;
using NuGet.Packaging.Core;
using NuGet.Protocol;
using NuGet.Protocol.Core.Types;
using NuGet.Resolver;
using NuGet.Versioning;
using SharpNoteKernel;

namespace SharpNoteKernel;

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

    // ── NuGet internals ───────────────────────────────────────────────────────

    private const string NuGetOfficialFeed = "https://api.nuget.org/v3/index.json";
    private static readonly NuGetFramework TargetFramework = NuGetFramework.Parse("net10.0");

    private static List<SourceRepository> BuildSourceRepositories(IEnumerable<string>? sourceUrls)
    {
        var urls = sourceUrls?.Where(s => !string.IsNullOrWhiteSpace(s)).ToList()
                   ?? [];
        if (urls.Count == 0) urls.Add(NuGetOfficialFeed);
        return urls.Select(url => Repository.Factory.GetCoreV3(new PackageSource(url))).ToList();
    }

    // Resolves the version to install: parses the requested string, or finds
    // the latest stable (falling back to latest pre-release) from the feeds.
    private static async Task<NuGetVersion?> ResolveVersionAsync(
        string packageId, string? requestedVersion,
        List<SourceRepository> sources, SourceCacheContext cache)
    {
        if (requestedVersion != null)
            return NuGetVersion.Parse(requestedVersion);

        foreach (var source in sources)
        {
            try
            {
                var res = await source.GetResourceAsync<FindPackageByIdResource>();
                var versions = (await res.GetAllVersionsAsync(packageId, cache, NullLogger.Instance, CancellationToken.None))?.ToList();
                if (versions == null || versions.Count == 0) continue;
                return versions.Where(v => !v.IsPrerelease).DefaultIfEmpty().Max()
                    ?? versions.Max();
            }
            catch { }
        }
        return null;
    }

    // Recursively collects the full set of SourcePackageDependencyInfo needed
    // to satisfy the given package and all its transitive dependencies.
    private static async Task CollectDependenciesAsync(
        PackageIdentity package,
        NuGetFramework framework,
        List<SourceRepository> sources,
        SourceCacheContext cache,
        HashSet<SourcePackageDependencyInfo> available)
    {
        if (available.Contains(package)) return;

        foreach (var source in sources)
        {
            try
            {
                var depRes = await source.GetResourceAsync<DependencyInfoResource>();
                var depInfo = await depRes.ResolvePackage(package, framework, cache, NullLogger.Instance, CancellationToken.None);
                if (depInfo == null) continue;

                available.Add(depInfo);

                foreach (var dep in depInfo.Dependencies)
                {
                    foreach (var src in sources)
                    {
                        try
                        {
                            var findRes = await src.GetResourceAsync<FindPackageByIdResource>();
                            var versions = await findRes.GetAllVersionsAsync(dep.Id, cache, NullLogger.Instance, CancellationToken.None);
                            var best = dep.VersionRange.FindBestMatch(versions);
                            if (best == null) continue;
                            await CollectDependenciesAsync(new PackageIdentity(dep.Id, best), framework, sources, cache, available);
                            break;
                        }
                        catch { }
                    }
                }
                break;
            }
            catch { }
        }
    }

    // Downloads the package to the global NuGet cache if it isn't already there.
    private static async Task EnsureDownloadedAsync(
        PackageIdentity identity,
        List<SourceRepository> sources,
        SourceCacheContext cache,
        string globalPackagesFolder)
    {
        if (Directory.Exists(GetLocalPackagePath(globalPackagesFolder, identity))) return;

        foreach (var source in sources)
        {
            try
            {
                var dlRes = await source.GetResourceAsync<DownloadResource>();
                var result = await dlRes.GetDownloadResourceResultAsync(
                    identity,
                    new PackageDownloadContext(cache),
                    globalPackagesFolder,
                    NullLogger.Instance,
                    CancellationToken.None);

                if (result.Status == DownloadResourceResultStatus.Available ||
                    result.Status == DownloadResourceResultStatus.AvailableWithoutStream)
                    break;
            }
            catch { }
        }
    }

    private static string GetLocalPackagePath(string globalPackagesFolder, PackageIdentity identity)
        => Path.Combine(globalPackagesFolder,
                        identity.Id.ToLowerInvariant(),
                        identity.Version.ToNormalizedString().ToLowerInvariant());

    // Finds the best net10.0-compatible DLLs from a package already in the
    // local cache, using NuGet's own framework compatibility rules.
    private static List<string> GetDllsFromLocalPackage(string packagePath, NuGetFramework targetFramework)
    {
        var result = new List<string>();
        if (!Directory.Exists(packagePath)) return result;
        try
        {
            var reader = new PackageFolderReader(packagePath);
            var nearest = NuGetFrameworkUtility.GetNearest(
                reader.GetLibItems(), targetFramework, g => g.TargetFramework);
            if (nearest == null) return result;
            foreach (var item in nearest.Items)
            {
                if (!item.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)) continue;
                var fullPath = Path.Combine(packagePath, item.Replace('/', Path.DirectorySeparatorChar));
                if (File.Exists(fullPath)) result.Add(fullPath);
            }
        }
        catch { }
        return result;
    }

    // ── NuGet package loader ──────────────────────────────────────────────────

    internal static async Task<(ScriptOptions opts, string? error, string? resolvedVersion)> LoadNuGetAsync(
        string packageId, string? version, ScriptOptions options,
        string cellId, TextWriter realStdout, IEnumerable<string>? sourceUrls = null)
    {
        var key = $"{packageId.ToLower()}/{version ?? "*"}";
        if (_loadedNugetKeys.Contains(key)) return (options, null, version);

        try
        {
            var sources = BuildSourceRepositories(sourceUrls);
            var cache = new SourceCacheContext();

            // 1. Resolve the version to install.
            var resolvedVersion = await ResolveVersionAsync(packageId, version, sources, cache);
            if (resolvedVersion == null)
                return (options, $"NuGet: package '{packageId}' not found on any configured source", null);

            var resolvedVersionStr = resolvedVersion?.ToNormalizedString();
            var rootIdentity = new PackageIdentity(packageId, resolvedVersion);

            // 2. Collect the full transitive dependency closure.
            var available = new HashSet<SourcePackageDependencyInfo>(PackageIdentityComparer.Default);
            await CollectDependenciesAsync(rootIdentity, TargetFramework, sources, cache, available);

            // Ensure the root is present even if dep collection found nothing.
            if (available.Count == 0)
                await CollectDependenciesAsync(rootIdentity, NuGetFramework.AnyFramework, sources, cache, available);

            // 3. Resolve install order via the NuGet resolver.
            IEnumerable<PackageIdentity> toInstall;
            try
            {
                var ctx = new PackageResolverContext(
                    dependencyBehavior: DependencyBehavior.Lowest,
                    targetIds: [packageId],
                    requiredPackageIds: [],
                    packagesConfig: [],
                    preferredVersions: [],
                    availablePackages: available,
                    packageSources: sources.Select(s => s.PackageSource),
                    log: NullLogger.Instance);
                toInstall = new PackageResolver()
                    .Resolve(ctx, CancellationToken.None)
                    .Select(p => new PackageIdentity(p.Id, p.Version));
            }
            catch
            {
                // Resolver couldn't satisfy constraints — fall back to the raw available set.
                toInstall = available.Select(p => new PackageIdentity(p.Id, p.Version));
            }

            // 4. Download each package (skips if already in global cache) and load DLLs.
            var globalPackagesFolder = SettingsUtility.GetGlobalPackagesFolder(
                Settings.LoadDefaultSettings(null));

            foreach (var pkg in toInstall)
            {
                var pkgKey = $"{pkg.Id.ToLower()}/{pkg.Version}";
                if (_loadedNugetKeys.Contains(pkgKey)) continue;

                await EnsureDownloadedAsync(pkg, sources, cache, globalPackagesFolder);

                foreach (var dll in GetDllsFromLocalPackage(GetLocalPackagePath(globalPackagesFolder, pkg), TargetFramework))
                {
                    try { options = options.AddReferences(Assembly.LoadFrom(dll)); }
                    catch { }
                }
                _loadedNugetKeys.Add(pkgKey);
            }

            _loadedNugetKeys.Add(key);
            return (options, null, resolvedVersionStr);
        }
        catch (Exception ex)
        {
            return (options, $"NuGet error: {ex.Message}", null);
        }
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

            var (updatedOpts, nugetErr, resolvedVer) =
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
                { type = "nuget_status", id = pkgId, version = resolvedVer ?? pkgVer, status = "loaded" }));
                LogContext.WriteNotebook($"NuGet preload loaded: {pkgId} {resolvedVer ?? pkgVer ?? "latest"}");
            }
        }
        realStdout.WriteLine(JsonSerializer.Serialize(new { type = "nuget_preload_complete" }));
    }
}
