using System.Collections.Generic;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;

namespace SharpNoteKernel.Db;

// ── IDbProvider interface ─────────────────────────────────────────────────────

public interface IDbProvider
{
    string Key { get; }
    string DisplayName { get; }
    IEnumerable<Assembly> RequiredAssemblies { get; }
    string GetUsingDirectives();
    string GetConfigureCallCode(string csVar);
    Task<DbSchema> IntrospectAsync(string connectionId, string connectionString, CancellationToken ct = default);

    /// <summary>True for SQL databases that use EF Core + DbContext codegen.</summary>
    bool IsRelational => true;

    /// <summary>True when the generated DbContext takes a persistent SqliteConnection instead of a string.</summary>
    bool UsesPersistentConnection => false;

    /// <summary>Normalizes a provider-specific connection string before it is stored and used.</summary>
    string NormalizeConnectionString(string connectionId, string connectionString) => connectionString;
}
