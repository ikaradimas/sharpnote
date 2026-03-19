using Microsoft.CodeAnalysis;
using PolyglotKernel.Db;

namespace PolyglotKernel;

// ── DB connection info record ─────────────────────────────────────────────────

record DbConnectionInfo(string Id, string Name, string Provider,
    string ConnectionString, string VarName, MetadataReference MetaRef, DbSchema Schema);
