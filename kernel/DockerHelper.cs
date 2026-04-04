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

    internal static string RunDocker(string args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "docker",
            Arguments = args,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using var proc = Process.Start(psi)!;
        var stdout = proc.StandardOutput.ReadToEnd();
        var stderr = proc.StandardError.ReadToEnd();
        proc.WaitForExit();

        if (proc.ExitCode != 0)
            throw new InvalidOperationException($"docker {args.Split(' ')[0]} failed: {stderr.Trim()}");

        return stdout;
    }
}
