using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using SharpNoteKernel;

namespace SharpNoteKernel;

partial class Program
{
    private static readonly HashSet<string> _trackedContainers = new();

    internal static HashSet<string> GetTrackedContainers()
    {
        lock (_trackedContainers) { return new HashSet<string>(_trackedContainers); }
    }

    internal static async Task HandleExecuteDocker(JsonElement msg, TextWriter realStdout)
    {
        var cellId        = msg.TryGetProperty("id",            out var p) ? p.GetString() : null;
        var image         = msg.TryGetProperty("image",         out var pi) ? pi.GetString()?.Trim() : "";
        var containerName = msg.TryGetProperty("containerName", out var pn) ? pn.GetString()?.Trim() : "";
        var portsStr      = msg.TryGetProperty("ports",         out var pp) ? pp.GetString()?.Trim() : "";
        var envStr        = msg.TryGetProperty("env",           out var pe) ? pe.GetString()?.Trim() : "";
        var volume        = msg.TryGetProperty("volume",        out var pv) ? pv.GetString()?.Trim() : "";
        var command       = msg.TryGetProperty("command",       out var pc) ? pc.GetString()?.Trim() : "";

        if (string.IsNullOrEmpty(image))
        {
            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "error", id = cellId, message = "Docker cell: no image specified." }));
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "complete", id = cellId, success = false }));
            }
            return;
        }

        try
        {
            var containerId = await Task.Run(() =>
            {
                // Parse ports: "8080:80, 3000:3000" → Dictionary
                Dictionary<string, string>? ports = null;
                if (!string.IsNullOrEmpty(portsStr))
                {
                    ports = new Dictionary<string, string>();
                    foreach (var mapping in portsStr.Split(',', StringSplitOptions.RemoveEmptyEntries))
                    {
                        var parts = mapping.Trim().Split(':', 2);
                        if (parts.Length == 2)
                            ports[parts[0].Trim()] = parts[1].Trim();
                    }
                }

                // Parse env: "KEY=val, FOO=bar" → Dictionary
                Dictionary<string, string>? env = null;
                if (!string.IsNullOrEmpty(envStr))
                {
                    env = new Dictionary<string, string>();
                    foreach (var entry in envStr.Split(',', StringSplitOptions.RemoveEmptyEntries))
                    {
                        var parts = entry.Trim().Split('=', 2);
                        if (parts.Length == 2)
                            env[parts[0].Trim()] = parts[1].Trim();
                    }
                }

                // Build image + command
                var fullImage = !string.IsNullOrEmpty(command) ? $"{image} {command}" : image;

                return DockerHelper.RunDocker(BuildDockerRunArgs(
                    fullImage,
                    string.IsNullOrEmpty(containerName) ? null : containerName,
                    ports, env,
                    string.IsNullOrEmpty(volume) ? null : volume)).Trim();
            });

            lock (_trackedContainers) { _trackedContainers.Add(containerId); }

            // Send started notification
            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                {
                    type = "docker_started",
                    id = cellId,
                    containerId = containerId.Length > 12 ? containerId[..12] : containerId,
                    containerImage = image,
                    containerName = containerName,
                }));
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "complete", id = cellId, success = true }));
            }

            LogContext.WriteNotebook($"Docker: started {image} → {containerId[..Math.Min(12, containerId.Length)]}");
        }
        catch (Exception ex)
        {
            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "error", id = cellId, message = ex.Message }));
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "complete", id = cellId, success = false }));
            }
        }
    }

    private static string BuildDockerRunArgs(
        string image, string? name,
        Dictionary<string, string>? ports,
        Dictionary<string, string>? env,
        string? volume)
    {
        var args = new System.Text.StringBuilder("run -d");
        if (name != null) args.Append($" --name {name}");
        if (ports != null)
            foreach (var (host, container) in ports)
                args.Append($" -p {host}:{container}");
        if (env != null)
            foreach (var (k, v) in env)
                args.Append($" -e {k}={v}");
        if (volume != null) args.Append($" -v {volume}");
        args.Append($" {image}");
        return args.ToString();
    }

    internal static async Task HandleStopDocker(JsonElement msg, TextWriter realStdout)
    {
        var cellId      = msg.TryGetProperty("id",          out var p) ? p.GetString() : null;
        var containerId = msg.TryGetProperty("containerId",  out var pc) ? pc.GetString()?.Trim() : "";

        if (string.IsNullOrEmpty(containerId))
        {
            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "complete", id = cellId, success = true }));
            }
            return;
        }

        try
        {
            await Task.Run(() =>
            {
                try { DockerHelper.RunDocker($"stop {containerId}"); } catch { }
                try { DockerHelper.RunDocker($"rm -f {containerId}"); } catch { }
            });

            lock (_trackedContainers) { _trackedContainers.Remove(containerId); }

            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                {
                    type = "docker_stopped",
                    id = cellId,
                    containerId,
                }));
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "complete", id = cellId, success = true }));
            }

            LogContext.WriteNotebook($"Docker: stopped {containerId}");
        }
        catch (Exception ex)
        {
            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "error", id = cellId, message = ex.Message }));
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "complete", id = cellId, success = false }));
            }
        }
    }

    internal static async Task HandleDockerStatus(JsonElement msg, TextWriter realStdout)
    {
        var cellId      = msg.TryGetProperty("id",          out var p) ? p.GetString() : null;
        var containerId = msg.TryGetProperty("containerId",  out var pc) ? pc.GetString()?.Trim() : "";

        try
        {
            var (running, status, ports) = await Task.Run(() =>
            {
                if (string.IsNullOrEmpty(containerId)) return (false, "no container", "");
                try
                {
                    var isRunning = DockerHelper.RunDocker(
                        $"inspect -f {{{{.State.Running}}}} {containerId}").Trim()
                        .Equals("true", StringComparison.OrdinalIgnoreCase);
                    var statusStr = DockerHelper.RunDocker(
                        $"inspect -f {{{{.State.Status}}}} {containerId}").Trim();
                    var portsStr = "";
                    try
                    {
                        portsStr = DockerHelper.RunDocker(
                            $"port {containerId}").Trim();
                    }
                    catch { }
                    return (isRunning, statusStr, portsStr);
                }
                catch { return (false, "not found", ""); }
            });

            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                {
                    type = "docker_status",
                    id = cellId,
                    containerId,
                    running,
                    status,
                    ports,
                }));
            }
        }
        catch (Exception ex)
        {
            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                {
                    type = "docker_status",
                    id = cellId,
                    containerId,
                    running = false,
                    status = ex.Message,
                    ports = "",
                }));
            }
        }
    }

    internal static async Task HandleDockerLogs(JsonElement msg, TextWriter realStdout)
    {
        var cellId      = msg.TryGetProperty("id",          out var p) ? p.GetString() : null;
        var containerId = msg.TryGetProperty("containerId",  out var pc) ? pc.GetString()?.Trim() : "";
        var tail        = msg.TryGetProperty("tail",         out var pt) ? pt.GetInt32() : 200;

        try
        {
            var logs = await Task.Run(() =>
            {
                if (string.IsNullOrEmpty(containerId)) return "";
                return DockerHelper.RunDocker($"logs --tail {tail} {containerId}");
            });

            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                {
                    type = "docker_logs",
                    id = cellId,
                    containerId,
                    logs,
                }));
            }
        }
        catch (Exception ex)
        {
            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                {
                    type = "docker_logs",
                    id = cellId,
                    containerId,
                    logs = $"Error fetching logs: {ex.Message}",
                }));
            }
        }
    }

    internal static void CleanupAllDockerContainers(TextWriter realStdout)
    {
        HashSet<string> snapshot;
        lock (_trackedContainers)
        {
            snapshot = new HashSet<string>(_trackedContainers);
            _trackedContainers.Clear();
        }

        foreach (var id in snapshot)
        {
            try
            {
                DockerHelper.RunDocker($"stop {id}");
                DockerHelper.RunDocker($"rm -f {id}");
                LogContext.WriteNotebook($"Docker: cleanup stopped {id}");
            }
            catch (Exception ex)
            {
                LogContext.WriteNotebook($"Docker: cleanup failed for {id}: {ex.Message}");
            }
        }
    }
}
