using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using SharpNoteKernel;

namespace SharpNoteKernel;

partial class Program
{
    internal static async Task HandleExecuteShell(
        JsonElement msg,
        TextWriter realStdout)
    {
        var cellId  = msg.TryGetProperty("id",      out var cid) ? cid.GetString() : null;
        var content = msg.TryGetProperty("content",  out var cp)  ? cp.GetString()  : "";
        var cwd     = msg.TryGetProperty("cwd",      out var cwdP) ? cwdP.GetString()?.Trim() : null;

        try
        {
            // Parse: first line is the command, rest is piped as stdin (or ignored)
            var lines = (content ?? "").Split('\n', 2);
            var cmdLine = lines[0].Trim();
            if (string.IsNullOrEmpty(cmdLine))
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "error", id = cellId, message = "Shell cell: no command specified." }));
                realStdout.WriteLine(JsonSerializer.Serialize(new { type = "complete", id = cellId, success = false }));
                return;
            }

            // Split command into executable + args (respect quoted strings simply)
            string exe, args;
            if (System.Runtime.InteropServices.RuntimeInformation.IsOSPlatform(
                    System.Runtime.InteropServices.OSPlatform.Windows))
            {
                exe  = "cmd.exe";
                args = $"/c {cmdLine}";
            }
            else
            {
                exe  = "/bin/sh";
                args = $"-c \"{cmdLine.Replace("\\", "\\\\").Replace("\"", "\\\"")}\"";
            }

            var psi = new ProcessStartInfo
            {
                FileName               = exe,
                Arguments              = args,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                UseShellExecute        = false,
                CreateNoWindow         = true,
            };
            if (!string.IsNullOrEmpty(cwd) && Directory.Exists(cwd))
                psi.WorkingDirectory = cwd;

            using var proc = Process.Start(psi)!;

            // Stream output using an updatable display handle — single <pre> block
            // that grows as lines arrive. Throttled: flush at most every 100ms to
            // avoid O(n²) serialization and IPC flooding for fast-producing commands.
            var handleId = Guid.NewGuid().ToString("N")[..12];
            var output   = new StringBuilder();
            var dirty    = false;
            var emitLock = new object();

            void EmitUpdate(bool force = false)
            {
                lock (emitLock)
                {
                    if (!force && !dirty) return;
                    dirty = false;
                    var html = $"<pre class=\"util-cmd-output\" style=\"margin:0;white-space:pre-wrap;max-height:500px;overflow:auto\">" +
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

            // Flush timer: emit pending output every 100ms
            using var flushTimer = new System.Threading.Timer(_ => EmitUpdate(), null, 100, 100);

            // Read stdout and stderr concurrently, marking dirty
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
            EmitUpdate(force: true); // final flush

            // Final update with exit code
            var exitCode = proc.ExitCode;
            if (exitCode != 0)
            {
                output.AppendLine($"\n[exit code {exitCode}]");
                EmitUpdate();
            }
            else if (output.Length == 0)
            {
                // Show something even if command produced no output
                output.Append("(no output)");
                EmitUpdate();
            }

            realStdout.WriteLine(JsonSerializer.Serialize(new
                { type = "complete", id = cellId, success = exitCode == 0 }));
        }
        catch (Exception ex)
        {
            var inner = ex is AggregateException agg ? agg.InnerException ?? ex : ex;
            realStdout.WriteLine(JsonSerializer.Serialize(new
            {
                type       = "error",
                id         = cellId,
                message    = inner.Message,
                stackTrace = inner.StackTrace,
            }));
            realStdout.WriteLine(JsonSerializer.Serialize(new { type = "complete", id = cellId, success = false }));
        }
    }
}
