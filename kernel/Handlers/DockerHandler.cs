using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
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

    private static string TrackContainer(string fullId)
    {
        var shortId = fullId.Trim();
        if (shortId.Length > 12) shortId = shortId[..12];
        lock (_trackedContainers) { _trackedContainers.Add(shortId); }
        return shortId;
    }

    private static void UntrackContainer(string id)
    {
        lock (_trackedContainers) { _trackedContainers.Remove(id); }
    }

    internal static async Task HandleExecuteDocker(JsonElement msg, TextWriter realStdout)
    {
        var cellId        = msg.TryGetProperty("id",            out var p) ? p.GetString() : null;
        var image         = msg.TryGetProperty("image",         out var pi) ? pi.GetString()?.Trim() : "";
        var containerName = msg.TryGetProperty("containerName", out var pn) ? pn.GetString()?.Trim() : "";
        var portsStr      = msg.TryGetProperty("ports",         out var pp) ? pp.GetString()?.Trim() : "";
        var envStr        = msg.TryGetProperty("env",           out var pe) ? pe.GetString()?.Trim() : "";
        var volume        = msg.TryGetProperty("volume",        out var pv) ? pv.GetString()?.Trim() : "";
        var command        = msg.TryGetProperty("command",       out var pc) ? pc.GetString()?.Trim() : "";

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
            // If a container with this name already exists and is running, reuse it
            if (!string.IsNullOrEmpty(containerName))
            {
                var docker = new DockerHelper(realStdout);
                if (docker.IsRunning(containerName))
                {
                    var existingFullId = "";
                    try { existingFullId = DockerHelper.RunDocker($"inspect -f {{{{.Id}}}} {containerName}").Trim(); }
                    catch { /* ignore */ }
                    var reusedId = TrackContainer(existingFullId);
                    lock (realStdout)
                    {
                        realStdout.WriteLine(JsonSerializer.Serialize(new
                        {
                            type = "docker_started",
                            id = cellId,
                            containerId = reusedId,
                            containerImage = image,
                            containerName,
                        }));
                        realStdout.WriteLine(JsonSerializer.Serialize(new
                            { type = "complete", id = cellId, success = true }));
                    }
                    return;
                }
                // Container exists but is stopped — remove it so we can recreate
                try { docker.Remove(containerName); } catch { /* ignore */ }
            }

            var fullId = await Task.Run(() =>
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

                var fullImage = !string.IsNullOrEmpty(command) ? $"{image} {command}" : image;

                // Reuse DockerHelper.Run which builds the same args
                var docker = new DockerHelper(realStdout);
                return docker.Run(fullImage,
                    string.IsNullOrEmpty(containerName) ? null : containerName,
                    ports, env,
                    string.IsNullOrEmpty(volume) ? null : volume);
            });

            var containerId = TrackContainer(fullId);

            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                {
                    type = "docker_started",
                    id = cellId,
                    containerId,
                    containerImage = image,
                    containerName,
                }));
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "complete", id = cellId, success = true }));
            }
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
            await Task.Run(() => new DockerHelper(realStdout).StopAndRemove(containerId));
            UntrackContainer(containerId);

            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "docker_stopped", id = cellId, containerId }));
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
            var (running, status, ports, healthStatus) = await Task.Run(() =>
            {
                if (string.IsNullOrEmpty(containerId)) return (false, "no container", "", "");
                try
                {
                    var docker = new DockerHelper(realStdout);
                    var isRunning = docker.IsRunning(containerId);
                    var statusStr = DockerHelper.RunDocker(
                        $"inspect -f {{{{.State.Status}}}} {containerId}").Trim();
                    var portsStr = "";
                    try { portsStr = DockerHelper.RunDocker($"port {containerId}").Trim(); }
                    catch { }
                    var health = "";
                    try { health = DockerHelper.RunDocker($"inspect -f {{{{.State.Health.Status}}}} {containerId}").Trim(); }
                    catch { }
                    return (isRunning, statusStr, portsStr, health);
                }
                catch { return (false, "not found", "", ""); }
            });

            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "docker_status", id = cellId, containerId, running, status, ports, healthStatus }));
            }
        }
        catch (Exception ex)
        {
            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "docker_status", id = cellId, containerId, running = false, status = ex.Message, ports = "" }));
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
                    { type = "docker_logs", id = cellId, containerId, logs }));
            }
        }
        catch (Exception ex)
        {
            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "docker_logs", id = cellId, containerId, logs = $"Error: {ex.Message}" }));
            }
        }
    }

    internal static async Task HandleDockerStats(JsonElement msg, TextWriter realStdout)
    {
        var cellId      = msg.TryGetProperty("id",          out var p) ? p.GetString() : null;
        var containerId = msg.TryGetProperty("containerId",  out var pc) ? pc.GetString()?.Trim() : "";

        try
        {
            var (cpuPercent, memUsage, memLimit) = await Task.Run(() =>
            {
                if (string.IsNullOrEmpty(containerId)) return (0.0, "", "");
                var raw = DockerHelper.RunDocker(
                    $"stats --no-stream --format \"{{{{.CPUPerc}}}}|{{{{.MemUsage}}}}\" {containerId}").Trim();
                var parts = raw.Split('|', 2);
                double cpu = 0;
                if (parts.Length > 0)
                    double.TryParse(parts[0].TrimEnd('%'), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out cpu);
                var memParts = parts.Length > 1 ? parts[1].Split('/') : Array.Empty<string>();
                var mem  = memParts.Length > 0 ? memParts[0].Trim() : "";
                var mLim = memParts.Length > 1 ? memParts[1].Trim() : "";
                return (cpu, mem, mLim);
            });

            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "docker_stats", id = cellId, containerId, cpuPercent, memUsage, memLimit }));
            }
        }
        catch (Exception ex)
        {
            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "docker_stats", id = cellId, containerId, cpuPercent = 0.0, memUsage = "", memLimit = "", error = ex.Message }));
            }
        }
    }

    private static readonly Dictionary<string, Process> _execProcesses = new();

    internal static async Task HandleDockerExec(JsonElement msg, TextWriter realStdout)
    {
        var cellId      = msg.TryGetProperty("id",          out var p) ? p.GetString() : null;
        var containerId = msg.TryGetProperty("containerId",  out var pc) ? pc.GetString()?.Trim() : "";
        var cmd         = msg.TryGetProperty("command",      out var cc) ? cc.GetString()?.Trim() : "/bin/sh";

        if (string.IsNullOrEmpty(containerId))
        {
            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "error", id = cellId, message = "No container specified for exec." }));
            }
            return;
        }

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName               = "docker",
                Arguments              = $"exec -i {containerId} {cmd}",
                RedirectStandardInput  = true,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                UseShellExecute        = false,
                CreateNoWindow         = true,
            };

            var proc = Process.Start(psi)!;
            var execId = $"{cellId}_{containerId}";
            lock (_execProcesses) { _execProcesses[execId] = proc; }

            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "docker_exec_started", id = cellId, containerId, execId }));
            }

            // Stream stdout/stderr back
            var handleId = Guid.NewGuid().ToString("N")[..12];
            var output   = new StringBuilder();
            var dirty    = false;
            var emitLock = new object();

            void EmitOutput()
            {
                lock (emitLock)
                {
                    if (!dirty) return;
                    dirty = false;
                    var html = $"<pre class=\"util-cmd-output\" style=\"margin:0;white-space:pre-wrap;max-height:400px;overflow:auto\">" +
                               $"{System.Net.WebUtility.HtmlEncode(output.ToString())}</pre>";
                    lock (realStdout)
                    {
                        realStdout.WriteLine(JsonSerializer.Serialize(new
                        {
                            type     = "display",
                            id       = cellId,
                            format   = "html",
                            content  = html,
                            handleId,
                            update   = output.Length > 0,
                        }));
                    }
                }
            }

            using var flushTimer = new System.Threading.Timer(_ => EmitOutput(), null, 100, 100);

            var stdoutTask = Task.Run(async () =>
            {
                string? line;
                while ((line = await proc.StandardOutput.ReadLineAsync()) != null)
                {
                    lock (emitLock) { output.AppendLine(line); dirty = true; }
                }
            });

            var stderrTask = Task.Run(async () =>
            {
                string? line;
                while ((line = await proc.StandardError.ReadLineAsync()) != null)
                {
                    lock (emitLock) { output.AppendLine(line); dirty = true; }
                }
            });

            await Task.WhenAll(stdoutTask, stderrTask);
            await proc.WaitForExitAsync();
            EmitOutput();

            lock (_execProcesses) { _execProcesses.Remove(execId); }

            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "docker_exec_ended", id = cellId, containerId, exitCode = proc.ExitCode }));
            }
        }
        catch (Exception ex)
        {
            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "error", id = cellId, message = $"docker exec failed: {ex.Message}" }));
            }
        }
    }

    internal static void HandleDockerExecInput(JsonElement msg, TextWriter realStdout)
    {
        var cellId      = msg.TryGetProperty("id",          out var p) ? p.GetString() : null;
        var containerId = msg.TryGetProperty("containerId",  out var pc) ? pc.GetString()?.Trim() : "";
        var input       = msg.TryGetProperty("input",        out var pi) ? pi.GetString() : "";
        var execId = $"{cellId}_{containerId}";

        Process? proc;
        lock (_execProcesses) { _execProcesses.TryGetValue(execId, out proc); }
        if (proc != null && !proc.HasExited)
        {
            try { proc.StandardInput.WriteLine(input); }
            catch { }
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

        var docker = new DockerHelper(realStdout);
        foreach (var id in snapshot)
        {
            try
            {
                docker.StopAndRemove(id);
                LogContext.WriteNotebook($"Docker: cleanup stopped {id}");
            }
            catch (Exception ex)
            {
                LogContext.WriteNotebook($"Docker: cleanup failed for {id}: {ex.Message}");
            }
        }
    }
}
