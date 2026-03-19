using System;
using System.Linq;
using System.Reflection;

namespace SharpNoteKernel.Db;

// ── Assembly loader helper ────────────────────────────────────────────────────

internal static class AssemblyLoader
{
    public static Assembly? TryLoad(string name)
    {
        // Check if already loaded first
        var loaded = AppDomain.CurrentDomain.GetAssemblies()
            .FirstOrDefault(a => a.GetName().Name == name);
        if (loaded != null) return loaded;
        try { return Assembly.Load(name); }
        catch { return null; }
    }
}
