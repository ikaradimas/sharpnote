using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace SharpNoteKernel;

public record ContainerInfo(string Id, string Name, string Image, string Status, string Ports);

public class DockerHelper
{
    private readonly TextWriter _out;

    public DockerHelper(TextWriter output) => _out = output;

    /// <summary>Run a container. Returns container ID.</summary>
    public string Run(string image, string? name = null,
                      Dictionary<string, string>? ports = null,
                      Dictionary<string, string>? env = null,
                      string? volume = null,
                      bool detach = true)
    {
        var args = new StringBuilder("run");
        if (detach) args.Append(" -d");
        if (name != null) args.Append($" --name {name}");
        if (ports != null)
            foreach (var (host, container) in ports)
                args.Append($" -p {host}:{container}");
        if (env != null)
            foreach (var (k, v) in env)
                args.Append($" -e {k}={v}");
        if (volume != null) args.Append($" -v {volume}");
        args.Append($" {image}");

        var result = RunDocker(args.ToString());
        var id = result.Trim();

        LogContext.WriteNotebook($"Docker: started {image} → {id[..12]}");
        return id;
    }

    /// <summary>Stop a running container.</summary>
    public void Stop(string nameOrId) => RunDocker($"stop {nameOrId}");

    /// <summary>Remove a container (force).</summary>
    public void Remove(string nameOrId) => RunDocker($"rm -f {nameOrId}");

    /// <summary>Stop and remove a container, ignoring errors.</summary>
    public void StopAndRemove(string nameOrId)
    {
        try { Stop(nameOrId); } catch { }
        try { Remove(nameOrId); } catch { }
    }

    /// <summary>Stop and remove all containers tracked by Docker cells in this session.</summary>
    public int StopAllTracked()
    {
        // Delegate to the handler's tracked set
        var snapshot = Program.GetTrackedContainers();
        int count = 0;
        foreach (var id in snapshot)
        {
            try { StopAndRemove(id); count++; }
            catch { }
        }
        return count;
    }

    /// <summary>Execute a command inside a running container.</summary>
    public string Exec(string nameOrId, string command)
        => RunDocker($"exec {nameOrId} {command}");

    /// <summary>Check if a container is running.</summary>
    public bool IsRunning(string nameOrId)
    {
        try
        {
            var result = RunDocker($"inspect -f {{{{.State.Running}}}} {nameOrId}");
            return result.Trim().Equals("true", StringComparison.OrdinalIgnoreCase);
        }
        catch { return false; }
    }

    /// <summary>List all containers with status.</summary>
    public List<ContainerInfo> List()
    {
        var result = RunDocker("ps -a --format \"{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}\"");
        return result.Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(line =>
            {
                var parts = line.Split('\t');
                return new ContainerInfo(
                    parts.ElementAtOrDefault(0) ?? "",
                    parts.ElementAtOrDefault(1) ?? "",
                    parts.ElementAtOrDefault(2) ?? "",
                    parts.ElementAtOrDefault(3) ?? "",
                    parts.ElementAtOrDefault(4) ?? ""
                );
            }).ToList();
    }

    private static readonly string DockerPath = ResolveDocker();

    private static string ResolveDocker()
    {
        string[] candidates = OperatingSystem.IsWindows()
            ? new[] { @"C:\Program Files\Docker\Docker\resources\bin\docker.exe" }
            : new[] { "/usr/local/bin/docker", "/opt/homebrew/bin/docker" };

        foreach (var p in candidates)
            if (File.Exists(p)) return p;

        return "docker"; // fall back to PATH
    }

    private static readonly string ExtendedPath = BuildExtendedPath();

    private static string BuildExtendedPath()
    {
        var current = Environment.GetEnvironmentVariable("PATH") ?? "";
        if (OperatingSystem.IsWindows()) return current;
        var extras = new[] { "/usr/local/bin", "/opt/homebrew/bin" };
        var parts = new HashSet<string>(current.Split(':'));
        foreach (var p in extras)
            if (!parts.Contains(p)) current = $"{current}:{p}";
        return current;
    }

    internal static string RunDocker(string args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = DockerPath,
            Arguments = args,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        psi.Environment["PATH"] = ExtendedPath;
        using var proc = Process.Start(psi)!;
        var stdout = proc.StandardOutput.ReadToEnd();
        var stderr = proc.StandardError.ReadToEnd();
        proc.WaitForExit();

        if (proc.ExitCode != 0)
            throw new InvalidOperationException($"docker {args.Split(' ')[0]} failed: {stderr.Trim()}");

        return stdout;
    }
}
